import { Octokit } from "@octokit/rest"
import { Groq } from 'groq-sdk'
import { type NextRequest, NextResponse } from "next/server"
import { redis, CACHE_KEYS, CACHE_TTL, type ReadmeGenerationStatus } from "@/lib/redis"

// Initialize Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
})

const octokit = new Octokit({
  auth: process.env.GITHUB_ACCESS_TOKEN,
})

async function fetchLanguages(owner: string, repo: string) {
  const { data } = await octokit.repos.listLanguages({ owner, repo })
  return data
}

async function fetchFileContents(owner: string, repo: string, path: string) {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path })
    return "content" in data ? Buffer.from(data.content, "base64").toString() : null
  } catch (e) {
    console.error(`Error fetching file content at path: ${path}`, e)
    return null
  }
}

// Type for repo tree entries
interface RepoTreeEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  content?: string | null;
}

// Recursively fetch files and their contents (with limits)
async function fetchRepoTreeAndContents(
  owner: string,
  repo: string,
  path = "",
  depth = 0,
  maxDepth = 2,
  maxFiles = 30,
  collected: RepoTreeEntry[] = []
): Promise<RepoTreeEntry[]> {
  if (depth > maxDepth || collected.length >= maxFiles) return collected;
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    if (Array.isArray(data)) {
      for (const item of data) {
        if (collected.length >= maxFiles) break;
        if (item.type === "file") {
          // Only fetch content for key files or small files
          let content: string | null = null;
          if (/^(readme|package|tsconfig|next\.config|dockerfile|\.env|main|index|app|src|setup|config|requirements|pyproject|composer|build|Makefile|Procfile|server|client|api|lib|utils|test|spec|docs?)\./i.test(item.name) || item.size < 20000) {
            try {
              const fileContent = await fetchFileContents(owner, repo, item.path);
              // Only take first 1000 chars for large files
              content = fileContent ? fileContent.slice(0, 1000) + (fileContent.length > 1000 ? "\n... (truncated)" : "") : null;
            } catch {}
          }
          collected.push({ name: item.name, path: item.path, type: "file", content });
        } else if (item.type === "dir") {
          collected.push({ name: item.name, path: item.path, type: "dir" });
          await fetchRepoTreeAndContents(owner, repo, item.path, depth + 1, maxDepth, maxFiles, collected);
        }
      }
    }
  } catch (e) {
    // Ignore errors for folders/files we can't access
  }
  return collected;
}

// Check if README generation is already in progress or completed
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const repoUrl = url.searchParams.get("repoUrl")

    if (!repoUrl) {
      return NextResponse.json({ error: "Repository URL is required" }, { status: 400 })
    }

    // Check if we have a cached README
    const cachedReadme = await redis.get(CACHE_KEYS.README_GENERATION(repoUrl))
    if (cachedReadme) {
      return NextResponse.json({
        status: "completed",
        readme: cachedReadme,
      })
    }

    // Check the status of generation
    const status = await redis.get<ReadmeGenerationStatus>(CACHE_KEYS.README_STATUS(repoUrl))

    return NextResponse.json({
      status: status || "not_started",
    })
  } catch (error: any) {
    console.error("Error checking README status:", error)
    return NextResponse.json({ error: "Failed to check README status", details: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    // Accept 'force' to bypass cache and always regenerate
    const { repoUrl, customInstructions, force } = await req.json()

    if (!repoUrl) {
      return NextResponse.json({ error: "Repository URL is required" }, { status: 400 })
    }

    const match = repoUrl.match(/github\.com\/(.+?)\/(.+?)(?:\.git)?$/)
    if (!match) {
      return NextResponse.json({ error: "Invalid GitHub URL" }, { status: 400 })
    }

    // Check if we already have a cached README, unless force is true
    if (!force) {
    const cachedReadme = await redis.get(CACHE_KEYS.README_GENERATION(repoUrl))
    if (cachedReadme) {
      return NextResponse.json({
        status: "completed",
        readme: cachedReadme,
        cached: true,
      })
      }
    }

    // Check if generation is already in progress
    const status = await redis.get<ReadmeGenerationStatus>(CACHE_KEYS.README_STATUS(repoUrl))
    if (status === "processing" || status === "pending") {
      return NextResponse.json({
        status: status,
        message: "README generation is already in progress",
      })
    }

    // Set status to pending
    await redis.set(CACHE_KEYS.README_STATUS(repoUrl), "pending", { ex: CACHE_TTL.STATUS })

    // Start the generation process in the background
    generateReadmeInBackground(repoUrl, customInstructions)

    return NextResponse.json({
      status: "pending",
      message: "README generation has started",
    })
  } catch (error: any) {
    console.error("Error starting README generation:", error)
    return NextResponse.json({ error: "Failed to start README generation", details: error.message }, { status: 500 })
  }
}

// Add multiple creative prompt templates
const promptTemplates = [
  // Fun and engaging
  `# Context\nYou are a creative technical writer. Write a README that is fun, engaging, and uses a unique structure. Use humor, analogies, and make it memorable. Avoid repeating previous outputs. Surprise the user!\n\n## Instructions\n- Use emojis and playful language.\n- Add a fun fact or tip about the project or its tech stack.\n- Make the sections stand out with creative titles.\n- End with a motivational quote about open source or coding.\n`,
  // Minimalist
  `# Context\nWrite a minimalist, clean, and highly readable README. Use short sentences and bullet points. Do NOT use the same structure as before.\n\n## Instructions\n- Be concise.\n- Use whitespace and simple formatting.\n- Focus on clarity.\n- Avoid unnecessary sections.\n`,
  // Professional
  `# Context\nWrite a professional, enterprise-style README. Use formal language and detailed explanations. Make it different from previous outputs.\n\n## Instructions\n- Use clear section headers.\n- Provide detailed setup and usage instructions.\n- Highlight best practices and code quality.\n- Encourage contributions in a formal tone.\n`,
  // Beginner-friendly
  `# Context\nWrite a README that is beginner-friendly and easy to follow. Assume the reader is new to open source.\n\n## Instructions\n- Explain all terms and steps.\n- Use simple language.\n- Add a short FAQ section.\n- Encourage questions and contributions.\n`,
  // Community-focused
  `# Context\nWrite a README that emphasizes community and collaboration.\n\n## Instructions\n- Highlight how to contribute.\n- Add a section about the community.\n- Use inclusive language.\n- Add a call to action for new contributors.\n`,
];

// Background process to generate README
async function generateReadmeInBackground(repoUrl: string, customInstructions?: string) {
  try {
    // Update status to processing
    await redis.set(CACHE_KEYS.README_STATUS(repoUrl), "processing", { ex: CACHE_TTL.STATUS })

    const match = repoUrl.match(/github\.com\/(.+?)\/(.+?)(?:\.git)?$/)
    if (!match) {
      throw new Error("Invalid GitHub URL")
    }

    const [_, owner, repo] = match
    const { data: repoData } = await octokit.repos.get({ owner, repo })
    const { data: rootContents } = await octokit.repos.getContent({ owner, repo, path: "" })

    const files = Array.isArray(rootContents)
      ? rootContents.map((item) => ({ name: item.name, type: item.type, path: item.path }))
      : []
    const languages = await fetchLanguages(owner, repo)

    // Recursively fetch important files and their contents (limit depth/files for efficiency)
    const repoTree = await fetchRepoTreeAndContents(owner, repo, "", 0, 2, 30, [])

    let packageJson = null
    const packageJsonFile = repoTree.find((file) => file.name === "package.json" && file.content)
    if (packageJsonFile && packageJsonFile.content) {
      try {
        packageJson = JSON.parse(packageJsonFile.content)
        } catch (e) {
          console.error("Error parsing package.json:", e)
      }
    }

    const dependencies = packageJson
      ? { dependencies: packageJson.dependencies || {}, devDependencies: packageJson.devDependencies || {} }
      : null

    const configFiles = {
      hasReact: repoTree.some(
        (f) =>
          f.name.includes("react") ||
          (dependencies?.dependencies && Object.keys(dependencies.dependencies).includes("react")),
      ),
      hasNext: repoTree.some(
        (f) =>
          f.name === "next.config.js" ||
          (dependencies?.dependencies && Object.keys(dependencies.dependencies).includes("next")),
      ),
      hasTypescript: repoTree.some(
        (f) =>
          f.name === "tsconfig.json" || repoTree.some((file) => file.name.endsWith(".ts") || file.name.endsWith(".tsx")),
      ),
      hasDocker: repoTree.some((f) => f.name === "Dockerfile" || f.name === "docker-compose.yml"),
      hasTests: repoTree.some(
        (f) =>
          f.name.includes("test") ||
          f.name.includes("spec") ||
          (dependencies?.devDependencies &&
            Object.keys(dependencies.devDependencies).some((dep) => dep.match(/jest|mocha|vitest/))),
      ),
    }

    const categorizedFiles = {
      configuration: repoTree.filter((f) => f.name.match(/\.json$|\.config\.js$|\.env\.example$|\.gitignore/)).map((f) => f.name),
      sourceCode: repoTree.filter((f) => f.name && f.name.match(/\.(js|ts|jsx|tsx|py|go|rb|php|java)$/) && !f.name.endsWith(".config.js")).map((f) => f.name),
      documentation: repoTree.filter((f) => f.name && (f.name.toLowerCase().includes("readme") || f.name.toLowerCase().includes("docs") || f.name.endsWith(".md"))).map((f) => f.name),
    }

    const existingReadme = repoTree.find((f) => f.name.toLowerCase() === "readme.md" && f.content)?.content || "No existing README found"

    // Build a context summary of the file tree and key file contents
    const fileContext = repoTree
      .map((f) => {
        if (f.type === "file" && f.content) {
          return `---\nFile: ${f.path}\n${f.content}\n`;
        } else if (f.type === "dir") {
          return `---\nDirectory: ${f.path}\n`;
        }
        return null;
      })
      .filter(Boolean)
      .join("\n");

    // Dynamic prompt based on user instructions
    let emojiInstruction = `Use Unicode emojis (not emoji codes) throughout the README to make it more visually appealing. Use emojis that are relevant to the content they accompany.`;
    if (customInstructions && /no emojis|don't use emojis|without emojis/i.test(customInstructions)) {
      emojiInstruction = `Do NOT use any emojis in the README.`;
    }

    // Add prompt variation for creativity
    const promptVariations = [
      "Make the README unique and engaging. Vary the structure and language each time.",
      "Add creative section titles and use a friendly, welcoming tone.",
      "Include a fun fact or tip about the project or its tech stack.",
      "Use a professional and concise style, but make it visually appealing.",
      "Highlight what makes this project different from others.",
      "Add a motivational or inspirational quote about open source or coding at the end.",
      "Make the README beginner-friendly and easy to follow.",
      "Emphasize best practices and code quality in the documentation.",
      "Add a short FAQ section if possible.",
      "Encourage contributions and community involvement in a creative way."
    ];
    const randomVariation = promptVariations[Math.floor(Math.random() * promptVariations.length)];

    // Randomly select a creative prompt template
    const creativePrompt = promptTemplates[Math.floor(Math.random() * promptTemplates.length)];

    const basePrompt = `
${creativePrompt}

# Repository Information\n- **Name**: ${repoData.name}\n- **Description**: ${repoData.description || "No description provided"}\n- **Stars**: ${repoData.stargazers_count}\n- **Forks**: ${repoData.forks_count}\n- **Languages**: ${Object.keys(languages).join(", ")}\n- **Owner**: ${owner}\n\n# File Tree and Key File Contents (truncated for large files):\n${fileContext}\n\n# Tech Stack Clues\n${JSON.stringify(configFiles, null, 2)}\n\n# Dependencies (if available)\n${dependencies ? JSON.stringify(dependencies, null, 2) : "No package.json found"}\n\n# File Structure Overview\nConfiguration files: ${categorizedFiles.configuration.join(", ") || "None found"}\nSource code files: ${categorizedFiles.sourceCode.join(", ") || "None found"}\nDocumentation files: ${categorizedFiles.documentation.join(", ") || "None found"}\n\n# Current README (if exists):\n${existingReadme}\n\n# Emoji Usage\n${emojiInstruction}\n\n${customInstructions ? `# Additional User Instructions\n${customInstructions}` : ""}\n\n# Prompt Variation\n${randomVariation}\n\n# Output\nReturn only the final README.md content in Markdown format, no explanation or additional headers.\n`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: basePrompt },
        { role: "user", content: "Generate a README that is different from any previous output for this repo. Be creative!" },
      ],
      model: "llama3-8b-8192",
      temperature: 1.5,
      max_completion_tokens: 2500,
      top_p: 0.8,
      stream: false,
      stop: null
    })

    const generatedReadme = completion.choices[0]?.message?.content

    if (!generatedReadme) {
      throw new Error("Failed to generate README")
    }

    // Cache the generated README
    await redis.set(CACHE_KEYS.README_GENERATION(repoUrl), generatedReadme, { ex: CACHE_TTL.README })

    // Update status to completed
    await redis.set(CACHE_KEYS.README_STATUS(repoUrl), "completed", { ex: CACHE_TTL.STATUS })

    return generatedReadme
  } catch (error) {
    console.error("Error generating README:", error)
    await redis.set(CACHE_KEYS.README_STATUS(repoUrl), "failed", { ex: CACHE_TTL.STATUS })
    throw error
  }
}

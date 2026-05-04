import { readdir, readFile, stat } from 'fs/promises'
import { join, extname } from 'path'
import type { FileContext } from '../src/lib/tokenEstimator'

const SCANNABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go', '.rs', '.java',
  '.swift', '.kt', '.cs', '.cpp', '.c', '.h', '.css', '.scss', '.html',
  '.json', '.yaml', '.yml', '.toml', '.md', '.sql',
])

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '__pycache__',
  '.venv', 'venv', 'coverage', '.cache',
])

/** Extract meaningful keywords from a prompt (strips stop words and short tokens). */
function extractKeywords(prompt: string): string[] {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'is',
    'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'this', 'that', 'these', 'those', 'it', 'its', 'you', 'your', 'we', 'our',
    'i', 'my', 'me', 'all', 'any', 'each', 'make', 'add', 'fix', 'update',
    'please', 'can', 'need', 'want', 'also', 'just', 'not', 'use',
  ])
  return prompt
    .toLowerCase()
    .split(/[\s\W]+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
}

async function countLines(filePath: string): Promise<number> {
  try {
    const content = await readFile(filePath, 'utf8')
    return content.split('\n').length
  } catch {
    return 0
  }
}

async function walkDir(dirPath: string, keywords: string[]): Promise<FileContext> {
  let fileCount = 0
  let totalLines = 0

  async function visit(currentPath: string): Promise<void> {
    let entries
    try {
      entries = await readdir(currentPath, { withFileTypes: true })
    } catch {
      return
    }

    await Promise.all(
      entries.map(async (entry) => {
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) {
            await visit(join(currentPath, entry.name))
          }
        } else if (entry.isFile()) {
          const ext = extname(entry.name)
          if (!SCANNABLE_EXTENSIONS.has(ext)) return

          const lowerName = entry.name.toLowerCase()
          const lowerPath = join(currentPath, entry.name).toLowerCase()
          const matched = keywords.some((kw) => lowerName.includes(kw) || lowerPath.includes(kw))
          if (!matched) return

          const lines = await countLines(join(currentPath, entry.name))
          fileCount++
          totalLines += lines
        }
      })
    )
  }

  await visit(dirPath)
  return { fileCount, totalLines }
}

/**
 * Scans a project directory for files likely touched by the given prompt.
 * Called by the daemon before estimating tokens — result is passed to estimateTaskTokens().
 */
export async function scanProjectFiles(projectPath: string, prompt: string): Promise<FileContext> {
  const keywords = extractKeywords(prompt)
  if (keywords.length === 0) return { fileCount: 0, totalLines: 0 }

  try {
    await stat(projectPath)
  } catch {
    return { fileCount: 0, totalLines: 0 }
  }

  return walkDir(projectPath, keywords)
}

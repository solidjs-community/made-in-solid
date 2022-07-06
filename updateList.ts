import { readFile, writeFile } from "fs/promises"
import { join } from "path"
import { getLinkPreview } from "link-preview-js"
import data from "./projects.json"

// UTILS

const pathTo = (...path: string[]) => join(__dirname, ...path)

const getCommentText = (text: string, marker: "START" | "END") => `<!-- ${text}:${marker} -->`

function insertTextBetweenComments(file: string, text: string, comment: string): string {
	const startComment = getCommentText(comment, "START")
	const endComment = getCommentText(comment, "END")
	const lines = file.split("\n")
	const start = lines.findIndex(line => line.includes(startComment))
	const end = lines.findIndex(line => line.includes(endComment), start + 1)
	if (start === -1 || end === -1) throw `Could not find ${comment} in ${file}`
	lines.splice(start + 1, end - start - 1, ...text.split("\n"))
	return lines.join("\n")
}

async function fetchPreviewImage(
	website: string,
	repo: string | undefined,
): Promise<{ image: string | undefined; description: string | undefined }> {
	let preview = await getLinkPreview(website)
	let description: string | undefined

	if ("images" in preview && preview.images.length)
		return { image: preview.images[0], description: preview.description }

	if ("description" in preview && preview.description) description = preview.description
	if (repo) {
		preview = await getLinkPreview(repo)
		if ("description" in preview && preview.description) description = preview.description
		if ("images" in preview && preview.images.length)
			return {
				image: preview.images[0],
				description,
			}
	}
	return { image: undefined, description }
}

// PROGRAM

;(async () => {
	const readmePath = pathTo("./README.md")
	let readme = await readFile(readmePath, "utf8")

	const projects = data.map(async ({ name, description, website, repo }, i) => {
		const { image, description: previewDesc } = await fetchPreviewImage(website, repo)
		return `${i > 0 ? "---" : ""}

${image ? `<a href="${website}"><img src="${image}" height="200"/></a>` : ""}

### ${name}

${previewDesc ?? description ?? ""}

**Website:** [${website}](${website})

${repo ? `**Repository:** [${repo}](${repo})` : ""}`
	})
	const projectsText = (await Promise.all(projects)).join("\n\n")

	readme = insertTextBetweenComments(readme, projectsText, "INSERT-PROJECTS")

	await writeFile(readmePath, readme)
})()

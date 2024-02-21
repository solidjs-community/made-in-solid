import * as fsp          from "node:fs/promises"
import * as path         from "node:path"
import * as url          from "node:url"
import * as link_preview from "link-preview-js"


/**
 * @typedef {object} ImagePreview
 * @property {string | undefined} image
 * @property {string | undefined} desc
 *
 * @typedef {object} Project
 * @property {string            } name
 * @property {string            } desc
 * @property {string            } link
 * @property {string | undefined} repo
 */

const dirname     = path.dirname(url.fileURLToPath(import.meta.url))
const readme_path = path.join(dirname, "./readme.md")
const data_path   = path.join(dirname, "./projects.json")


async function main() {
	const readme_promise   = fsp.readFile(readme_path, "utf8")
	const raw_data_promise = fsp.readFile(data_path, "utf8")

	let [readme, raw_data] = await Promise.all([readme_promise, raw_data_promise])
	/** @type {Project[]} */
	const projects = JSON.parse(raw_data)

	const previews_promise = projects.map((project) => fetchPreviewImage(project.link, project.repo))
	const previews = await Promise.all(previews_promise)

	let projects_txt = ""
	for (let i = 0; i < projects.length; i++) {
		const project = projects[i]
		const preview = previews[i]

		projects_txt += `${i > 0 ? "---" : ""}

${preview.image ? `<a href="${project.link}"><img src="${preview.image}" height="200"/></a>` : ""}

### ${project.name}

${preview.desc ?? project.desc ?? ""}

**Website:** [${project.link}](${project.link})

${project.repo ? `**Repository:** [${project.repo}](${project.repo})` : ""}`

		if (i < projects.length - 1) projects_txt += "\n\n"
	}

	readme = insertTextBetweenComments(readme, projects_txt, "INSERT-PROJECTS")

	fsp.writeFile(readme_path, readme)

	/* Write back to projects.json to format it */
	fsp.writeFile(data_path, JSON.stringify(projects, null, "\t"))
}

/**
 * @param   {string         } text
 * @param   {"START" | "END"} marker
 * @returns {string         } */
function getCommentText (text, marker) {
	return `<!-- ${text}:${marker} -->`
}

/**
 * @param   {string} file
 * @param   {string} text
 * @param   {string} comment
 * @returns {string} */
function insertTextBetweenComments(file, text, comment) {
	const startComment = getCommentText(comment, "START")
	const endComment = getCommentText(comment, "END")
	const lines = file.split("\n")
	const start = lines.findIndex(line => line.includes(startComment))
	const end = lines.findIndex(line => line.includes(endComment), start + 1)
	if (start === -1 || end === -1) throw `Could not find ${comment} in ${file}`
	lines.splice(start + 1, end - start - 1, ...text.split("\n"))
	return lines.join("\n")
}

const GET_LINK_PREVIEW_OPTIONS = /** @type {const} */({followRedirects: "follow"})

/**
 * @param   {string               } website
 * @param   {string | undefined   } repo
 * @returns {Promise<ImagePreview>} */
async function fetchPreviewImage(website, repo) {
	try {
		let preview = await link_preview.getLinkPreview(website, GET_LINK_PREVIEW_OPTIONS)
		/** @type {string | undefined} */
		let description

		if ("images" in preview && preview.images.length)
			return {image: preview.images[0], desc: preview.description}

		if ("description" in preview && preview.description) {
			description = preview.description
		}
		if (repo) {
			preview = await link_preview.getLinkPreview(repo, GET_LINK_PREVIEW_OPTIONS)
			if ("description" in preview && preview.description) description = preview.description
			if ("images" in preview && preview.images.length)
				return {
					image: preview.images[0],
					desc: description,
				}
		}
		return {image: undefined, desc: description}
	} catch (error) {
		console.error({ error, website, repo })
		return {image: undefined, desc: undefined}
	}
}


main()

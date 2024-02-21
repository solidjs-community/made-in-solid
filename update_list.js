import * as fsp  from "node:fs/promises"
import * as path from "node:path"
import * as url  from "node:url"

/**
 * @typedef {object} Project
 * @property {string            } name
 * @property {string            } desc
 * @property {string            } link
 * @property {string | undefined} repo
 *
 * @typedef {object} Project_Preview
 * @property {string       } name
 * @property {string       } desc
 * @property {string       } link
 * @property {string | null} repo
 * @property {string | null} image
 */

const dirname     = path.dirname(url.fileURLToPath(import.meta.url))
const readme_path = path.join(dirname, "./readme.md")
const data_path   = path.join(dirname, "./projects.json")

async function main() {
	const readme_promise = fsp.readFile(readme_path, "utf8")
	const raw_data = await fsp.readFile(data_path, "utf8")

	/** @type {Project[]} */
	const projects = JSON.parse(raw_data)
	const preview_promises = projects.map(fetch_project_preview)
	const previews = await Promise.all(preview_promises)

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

	let readme = await readme_promise
	readme = insertTextBetweenComments(readme, projects_txt, "INSERT-PROJECTS")

	fsp.writeFile(readme_path, readme)

	/* Write back to projects.json to format it */
	fsp.writeFile(data_path, JSON.stringify(projects, null, "\t"))
}

/**
 * @param   {string} html
 * @param   {string} name
 * @returns {string | null} */
function get_meta_tag_content(html, name) {
	const pattern_1 = `name="${name}"`
	const pattern_2 = `property="${name}"`

	/** @type {number} */
	let start = 0

	while (true) {
		start = html.indexOf("meta", start)
		if (start === -1) break
		start += 4

		let end = html.indexOf(">", start)
		if (end === -1) break

		let tag_text = html.slice(start, end)
		if (!tag_text.includes(pattern_1) && !tag_text.includes(pattern_2)) continue

		start = tag_text.indexOf('content="')
		if (start === -1) continue

		start += 9
		end = tag_text.indexOf('"', start)
		if (end === -1) continue

		return tag_text.slice(start, end)
	}

	return null
}

/**
 * @param   {string} html
 * @param   {string} project_link
 * @returns {string | null} */
function get_image_link(html, project_link) {
	let image
		= get_meta_tag_content(html, "og:image")
		?? get_meta_tag_content(html, "twitter:image")
		?? get_meta_tag_content(html, "twitter:image:src")

	if (!image) return null

	image = decodeURIComponent(image)
	image = image.replace(/&amp;/g, "&")

	if (!image.startsWith("http")) {
		image = new URL(image, project_link).href
	}

	return image
}

/**
 * @param   {string} html
 * @returns {string | null} */
function get_title_tag(html) {
	let start = html.indexOf("<title>")
	if (start === -1) return null
	start += 7

	let end = html.indexOf("</title>", start)
	if (end === -1) return null

	return html.slice(start, end)
}

const FETCH_HTML_OPTIONS = /** @type {const} */({
	headers: {
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
		accept: "text/html",
	}
})

/**
 * @param   {string} url
 * @returns {Promise<string | Error>} */
function fetch_html(url) {
	return fetch(url, FETCH_HTML_OPTIONS)
		.then(res => res.text())
		.catch(error => error)
}

/**
 * @param   {Project} project
 * @returns {Promise<Project_Preview>} */
async function fetch_project_preview(project) {
	/** @type {Project_Preview} */
	const preview = {
		name: project.name,
		desc: project.desc,
		link: project.link,
		repo: project.repo ?? null,
		image: null,
	}

	let html = await fetch_html(project.link)

	if (typeof html === "string") {
		preview.name
			= get_meta_tag_content(html, "og:site_name")
			?? get_title_tag(html)
			?? get_meta_tag_content(html, "og:title")
			?? get_meta_tag_content(html, "twitter:title")
			?? preview.name

		preview.image = get_image_link(html, project.link)

		preview.desc
			=  get_meta_tag_content(html, "og:description")
			?? get_meta_tag_content(html, "description")
			?? get_meta_tag_content(html, "twitter:description")
			?? preview.desc
	} else {
		console.error(`Error fetching ${project.link}: ${html.message}`)
	}

	if (project.repo && !preview.image) {
		html = await fetch_html(project.repo)

		if (typeof html === "string") {
			preview.image = get_image_link(html, project.link)
		} else {
			console.error(`Error fetching ${project.repo}: ${html.message}`)
		}
	}

	return preview
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


main()

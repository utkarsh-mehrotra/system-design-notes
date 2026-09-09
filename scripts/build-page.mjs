#!/usr/bin/env node
// Builds index.html: all notes as one static page, styled to match
// https://github.com/utkarsh-mehrotra/ddia-study-companion (paper/ink palette,
// IBM Plex type, sticky rail + top bar). Run: node scripts/build-page.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { marked } from "marked";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Topic folders in display order: [folder name, readme filename].
const TOPICS = readdirSync(root)
  .filter((name) => /^\d+\./.test(name) && statSync(path.join(root, name)).isDirectory())
  .sort((a, b) => parseInt(a) - parseInt(b))
  .map((folder) => {
    const readme = readdirSync(path.join(root, folder)).find((f) => /^readme\.md$/i.test(f));
    return { folder, readme };
  })
  .filter((t) => t.readme);

const imageCount = TOPICS.reduce((n, t) => {
  const dir = path.join(root, t.folder, "images");
  try {
    return n + readdirSync(dir).length;
  } catch {
    return n;
  }
}, 0);

// Rewrite relative image paths (./images/foo.png or images/foo.png) so they
// resolve from the repo root once every topic is concatenated onto one page.
function rewriteImagePaths(md, folder) {
  const prefix = encodeURI(folder) + "/images/";
  return md.replace(/(?:\.\/)?images\//g, prefix);
}

const raw = TOPICS.map((t) => {
  const md = readFileSync(path.join(root, t.folder, t.readme), "utf8");
  return rewriteImagePaths(md, t.folder);
}).join("\n\n");

// ---------- slug + TOC bookkeeping ----------
const seen = new Map();
function slugify(text) {
  let s = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  if (!s) s = "section";
  const n = seen.get(s) || 0;
  seen.set(s, n + 1);
  return n === 0 ? s : `${s}-${n}`;
}

const toc = []; // { id, text, level }

const renderer = {
  heading(token) {
    const text = this.parser.parseInline(token.tokens);
    const plain = token.text;
    const id = slugify(plain);
    if (token.depth === 1 || token.depth === 2) {
      toc.push({ id, text: plain, level: token.depth });
    }
    return `<h${token.depth} id="${id}">${text}</h${token.depth}>\n`;
  },
};
marked.use({ renderer, gfm: true });

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

const bodyHtml = marked.parse(raw);

// ---------- rail (grouped nav) ----------
let railHtml = "";
let currentGroupOpen = false;
for (const item of toc) {
  if (item.level === 1) {
    if (currentGroupOpen) railHtml += "</div>\n";
    railHtml += `<h4>${esc(item.text)}</h4>\n<div class="rail-group">\n`;
    railHtml += `<a href="#${item.id}" data-title="${esc(item.text)}">${esc(item.text)}</a>\n`;
    currentGroupOpen = true;
  } else {
    railHtml += `<a href="#${item.id}" class="sub" data-title="${esc(item.text)}">${esc(item.text)}</a>\n`;
  }
}
if (currentGroupOpen) railHtml += "</div>\n";

// Topics 01-03 (Scaling, Estimation, Interview Framework) are fundamentals;
// 04-28 are end-to-end case studies.
const primerCount = TOPICS.filter((t) => parseInt(t.folder) <= 3).length;
const caseCount = TOPICS.length - primerCount;

const template = readFileSync(path.join(__dirname, "page-template.html"), "utf8");
const out = template
  .replace("/*__RAIL__*/", railHtml)
  .replace("/*__BODY__*/", bodyHtml)
  .replace(/__CASE_COUNT__/g, String(caseCount))
  .replace(/__PRIMER_COUNT__/g, String(primerCount))
  .replace(/__IMAGE_COUNT__/g, String(imageCount));

writeFileSync(path.join(root, "index.html"), out);
console.log(`Built index.html — ${TOPICS.length} topics, ${toc.length} headings, ${imageCount} images.`);

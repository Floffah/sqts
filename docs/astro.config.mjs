// @ts-check
import {defineConfig} from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightGiscus from "starlight-giscus";

// https://astro.build/config
export default defineConfig({
	base: "/sqts",
	integrations: [
		starlight({
			title: 'SQTS',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/Floffah/sqts' }],
			sidebar: [
				{ label: "Introduction", link: "/intro" },
				{
					label: "Getting Started",
					items: [
						{
							label: "Setup",
							link: "/getting-started/setup"
						},
						{
							label: "Bundlers & Runtimes",
							link: "/getting-started/bundlers"
						},
					]
				},
				{
					label: "Guides",
					items: [
						{
							label: "Your First Query",
							link: "/guides/first-query"
						}
					]
				},
				{
					label: "Adapters",
					items: [
						{
							label: "Custom Adapter",
							link: "/adapters/custom"
						},
						{
							label: "Bun SQLite",
							link: "/adapters/bun-sqlite"
						},
					]
				},
				{
					label: "Reference",
					items: [
						{
							label: "Configuration",
							link: "/reference/configuration"
						},
						{
							label: "Executor Contract",
							link: "/reference/executor-contract"
						}
					]
				}
			],
			lastUpdated: true,
			editLink: {
				baseUrl: "https://github.com/floffah/sqts/edit/main/",
			},
			plugins: [
				starlightGiscus({
					repo: 'Floffah/sqts',
					repoId: 'R_kgDORanCUQ',
					category: 'Giscus',
					categoryId: 'DIC_kwDORanCUc4C3aTJ',
					lazy: true,
				})
			],
		}),
	],
});

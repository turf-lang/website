export const githubOrg = "turf-lang";
export const projectTopic = "made-with-turf";

export interface CommunityRepo {
    name: string;
    label: string;
    description: string;
}

export const communityRepos: CommunityRepo[] = [
    { name: "turf-lang", label: "Compiler", description: "The Turf language, compiler and standard library." },
    { name: "turf-cli", label: "Command line", description: "The turf tool: projects, builds, tests and packages." },
    { name: "turf-lsp", label: "Language server", description: "Diagnostics, hover and completion in your editor." },
    { name: "turf-fuzz", label: "Fuzzing", description: "Finds compiler bugs and turns them into regression tests." },
    { name: "website", label: "Website", description: "This website and its documentation." },
];

export const releaseRepo = "turf-lang";

export const repoUrl = (name: string) => `https://github.com/${githubOrg}/${name}`;

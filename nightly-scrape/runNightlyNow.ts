import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";
import { runNightlyJobs } from "./scheduler";

loadEnvFilesFromRepoRoot(import.meta.url);
console.log("Running all nightly jobs manually...");
runNightlyJobs().then(() => console.log("Done")).catch(console.error);

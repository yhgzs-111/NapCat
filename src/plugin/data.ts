import { dirname } from "path";
import { fileURLToPath } from "url";

export let current_path = dirname(fileURLToPath(import.meta.url));
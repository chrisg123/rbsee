import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  containerExists,
  containerRunning,
  stopContainer,
  removeContainer,
  loadImage,
  runContainer,
} from "../lib/docker-utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const containerName = "mockasite_export";
const dockerImgFile = path.resolve(__dirname, "../../resources/docker/mockasite_export.tar");
const exists = await containerExists(containerName);
const running = await containerRunning(containerName);

if (running) {
  console.log(`'${containerName}' running.`);
  process.exit(0);
} else {
  console.log(`'${containerName}' is not running.`);
}

if (exists) {
  console.log(`'${containerName}' exists.`);
} else {
  console.log(`'${containerName}' does not exist.`);
}

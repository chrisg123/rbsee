import { exec } from "node:child_process";

const dockerCmd = process.env.RBSEE_DOCKER_CMD || "docker";

function sh(cmd) {
  return new Promise((resolve, reject) => {
    const options = { maxBuffer: 1024 * 1024 };

    exec(cmd, options, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

export async function containerExists(name) {
  try {
    const { stdout } = await sh(`${dockerCmd} ps -a --format '{{.Names}}' | grep '^${name}$'`);
    return stdout !== "";
  } catch (err) {
    if (err.stderr) {
      console.error(err);
    }
    return false;
  }
}

export async function containerRunning(name) {
  try {
    const { stdout } = await sh(`${dockerCmd} ps --format '{{.Names}}' | grep '^${name}$'`);
    return stdout !== "";
  } catch (err) {
    if (err.stderr) {
      console.error(err);
    }
    return false;
  }
}

export async function stopContainer(name) {
  await sh(`${dockerCmd} stop ${name}`);
}

export async function removeContainer(name) {
  await sh(`${dockerCmd} rm -f ${name}`);
}

/** Loads a Docker image tarball and returns the parsed image reference. */
export async function loadImage(imageFile) {
  const { stdout } = await sh(`${dockerCmd} load -i "${imageFile}"`);
  const lines = stdout.split("\n");
  for (const line of lines) {
    let m = line.match(/Loaded image:\s+(.+)$/);
    if (m) {
      return m[1].trim();
    }

    m = line.match(/Loaded image ID:\s+(.+)$/);
    if (m) {
      return m[1].trim();
    }
  }
  throw new Error(`Could not parse image reference from docker load output:\n${stdout}`);
}

export async function runContainer(imageRef, containerName, portHost = 8081, portContainer = 8080) {
  const { stdout } = sh(`${dockerCmd} run -d --name ${containerName} -p ${portHost}:${portContainer} ${imageRef}`);
  return stdout;
}

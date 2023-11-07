# rbsee
A small tool for bringing certain financial records into view.

## Overview

`rbsee` is a small, private tool that automates the process of collecting
transaction data and official statements from a familiar institution.


## Run using a proxy for testing

Check if the proxy is running:
```sh
npm run mock:status
```

Start the proxy server:
```sh
npm run mock:up
```

Run automation in dev mode:
```sh
npm run dev
```

Stop the proxy server:
```sh
npm run mock:down
```

### Docker permissions
On some systems, Docker requires elevated privileges.

If needed, you can set a custom Docker command via:

```sh
export RBSEE_DOCKER_CMD="sudo docker"
```

## Related project: Mockasite

For local development and testing, `rbsee` can use a mock HTTP proxy instead of
talking to the real site. That proxy can be created with
[Mockasite](https://github.com/chrisg123/mockasite).

## License
`rbsee` is available under the [MIT License](LICENSE).

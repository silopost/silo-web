# silo-web

Web frontend of SiloPost: a self-hosted IMAP/SMTP mail client with a Gmail-like UX.
React 19, TypeScript (strict), Vite and Tailwind CSS 4. Talks to
[`silo-server`](https://github.com/silopost/silo-server) through `/api/v1/*`.

## Development

```sh
npm ci && npm run dev
```

The dev server runs on http://localhost:5173 and proxies `/api` to `http://localhost:8080`.
Override the target with `VITE_API_PROXY`:

```sh
VITE_API_PROXY=http://silo.local:8080 npm run dev
```

Other scripts: `typecheck`, `lint`, `format:check`, `test`, `build`.

## Docker

```sh
docker build -t silo-web .
docker run --rm -p 8081:80 silo-web
```

## Documentation

Architecture and roadmap: `ARCHITECTURE_AND_PLAN.md` in the
[`silo`](https://github.com/silopost/silo) repository.

## License

AGPL-3.0, see [LICENSE](LICENSE).

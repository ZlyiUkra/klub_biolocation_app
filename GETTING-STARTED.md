# Getting started on a fresh clone

This is the shortest correct way to run the club's site on your own machine: the site, its backend and its
database, all local. Nothing here needs an account, a server or a secret that is not made on your machine.

You will end with the site open at <http://localhost:3000/>, a PostgreSQL database in a container, and the posts and
videos of the repository loaded into it. Plan for about 20 minutes, most of it downloads.

## 1. What to install first

- **Git** - to clone the repository.
- **Node.js 20.x** (20.6 or newer) with the **npm 10** that ships with it. Other major versions are refused on
  purpose: `package.json` and `.npmrc` pin Node 20 (`engine-strict`), and `npm ci` stops with an "Unsupported engine"
  message on Node 18 or 22. A version manager helps: `nvm` (macOS, Linux), `nvm-windows` (Windows).
- **Docker** with Compose v2: **Docker Desktop** on Windows and macOS, Docker Engine with the Compose plugin on Linux.
  The database runs in one container; nothing else needs Docker. On a computer that cannot run Docker, install
  PostgreSQL 16 instead and follow [Without Docker](#without-docker-postgresql-on-the-machine-itself).
- A browser.

Check that all of it is in place; each command must print a version and not an error:

```sh
git --version
node --version      # v20.x.x
npm --version       # 10.x.x
docker --version
docker compose version
```

Start Docker Desktop before step 5 and wait until it says it is running.

## 2. Get the code

```sh
git clone <the address of the repository>
cd <the folder git created>
```

Every command below is run from that folder.

## 3. Install the packages

```sh
npm ci
```

`npm ci` installs exactly what `package-lock.json` says. Do not use `npm install` here.

## 4. Make your `.env`

The file `.env` holds this machine's settings and the database password. It is never committed (it is in
`.gitignore`) and no value is shared with anybody. Copy the template and edit the copy:

```sh
cp .env.example .env          # in Windows cmd or PowerShell: copy .env.example .env
```

Fill in exactly these four lines (the rest of the file stays commented out):

```text
PORT=3000
POSTGRES_PASSWORD=<a long random password: letters and digits only>
DATABASE_URL=postgres://klub:<the same password>@127.0.0.1:5433/klub
SITE_ORIGIN=http://localhost:3000,http://127.0.0.1:3000
```

- A good password is the output of `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.
  Use letters and digits only: the password is also part of the `DATABASE_URL` address, where signs such as `@` or `/`
  would break it.
- `POSTGRES_PASSWORD` and the password inside `DATABASE_URL` must be the same string.
- `5433` is the port the container is published on, on your machine only. It is not the usual 5432, so that it does
  not clash with a PostgreSQL you may already have.
- If port 3000 is busy on your machine, use another number in `PORT` and in both origins of `SITE_ORIGIN`.

## 5. Start the database container

Without Docker, skip this step: do [Without Docker](#without-docker-postgresql-on-the-machine-itself) instead, then
continue with step 6.

```sh
docker compose -f compose.dev.yml up -d db
```

The first run downloads the PostgreSQL 16 image (about 150 MB) and creates a data volume. Wait until the container is
healthy; this prints `healthy` in the status column after a few seconds:

```sh
docker compose -f compose.dev.yml ps
```

The container is published on `127.0.0.1` only; nothing outside your machine can reach it.

## 6. Create the tables and load the content

```sh
npm run db:migrate
npm run import:content
```

`db:migrate` builds the backend and creates the tables (it prints how many migrations it applied; run it again after
every `git pull`, it only applies what is new). `import:content` reads every post and video file under `src/content/`
and writes them to the database; it can be run again at any time and changes only what changed.

## 7. Start the site

```sh
npm run dev:site
```

This builds the site, starts the backend and serves everything on one port. When the log says it is listening, open
<http://localhost:3000/>. Stop it with `Ctrl+C`.

Use `dev:site`, not `npm run dev`: the pages of the rewritten site come from the backend, and `npm run dev` does not
start it.

## 8. Optional: make yourself the first administrator

The site works for a visitor with no account. To see the admin pages (`/admin/posts/`, `/admin/videos/`,
`/admin/users/`, `/admin/settings/`, `/admin/feedback/`), make an account that holds the superuser role. There are two
ways; use one.

**In a terminal:**

```sh
npm run superuser -- create you@example.com
```

The command asks for a password at the terminal (typing is not echoed) and prints ten recovery codes once; write them
down, they are not shown again. Then sign in at <http://localhost:3000/auth/signin/>.

**In the browser:** while no superuser exists, the server prints a line that starts with `SETUP:` and holds a code,
when it starts (it is renewed every hour). Open <http://localhost:3000/auth/setup/>, enter that code, your address and a
password; the page shows ten recovery codes once and then closes for good.

Either way, the address is stored in your local database only and no mail is sent to it.

## 9. Optional: see outgoing mail without a mail account

The feedback form and some admin actions send mail. With no mailbox configured, the messages wait in a queue and
nothing is lost. To read them as text files on your machine, make an empty folder and add its absolute path to `.env`:

```text
MAIL_OUTBOX_DIR=<the absolute path of the empty folder>
```

Restart `npm run dev:site` after changing `.env`.

## 10. Every day after that

```sh
docker compose -f compose.dev.yml up -d db     # when the container is not running
npm run dev:site                               # the site
```

After a `git pull`: run `npm ci` when `package-lock.json` changed, then `npm run db:migrate` and
`npm run import:content`.

Stop the database with `docker compose -f compose.dev.yml down` (the data stays in the volume). To throw the data away
and start from an empty database: `docker compose -f compose.dev.yml down -v`, then start again from step 5.

## 11. Checks

With the database container running:

```sh
npm run test:server       # the backend's test suite; each test makes and drops its own throwaway database
npm run check             # the type check and the formatting check
npm run build             # the production build
```

`npm run check` reports a list of files that are not formatted; that list is known and is not a fault of your setup.
Do not run `npm run fix`: it reformats the whole repository.

## 12. When something goes wrong

- **`npm ci` stops with "Unsupported engine"**: the Node version is not 20.x. Install Node 20 and open a new terminal.
- **`Missing environment variables: ...` at start**: `.env` is missing or a required line is empty (step 4).
- **`docker compose` says `Set POSTGRES_PASSWORD in .env`**: the line is missing; compose reads `.env` from the
  folder you run it in.
- **`password authentication failed` or the backend cannot connect**: the two passwords differ, or the volume was
  created with an earlier password (the image takes the password when the volume is first created). Fix `.env`, then
  `docker compose -f compose.dev.yml down -v` and start from step 5.
- **`port is already allocated` for 5433 or `address already in use` for 3000**: another program holds the port.
  Close it, or change the number (for 3000, in `PORT` and `SITE_ORIGIN`; for 5433, in `compose.dev.yml` and in
  `DATABASE_URL`).
- **A form answers "forbidden" or a sign-in does not stick**: the address in the browser is not one of the origins in
  `SITE_ORIGIN`. Open the site at the address listed there.
- **The site shows no posts**: `npm run import:content` has not been run against this database (step 6).

## Without Docker: PostgreSQL on the machine itself

For a computer that cannot run Docker Desktop, an older one for example. Docker is used here only for the development
database, so a PostgreSQL 16 server installed on the machine does the same job. This replaces step 5 and the two
`docker` lines of step 1; every other step stays as it is.

1. Install PostgreSQL 16, the version of the container and of production: on Windows with the installer linked from
   <https://www.postgresql.org/download/windows/>, on Linux from the PostgreSQL packages for the distribution
   (<https://www.postgresql.org/download/linux/>), on macOS with the installer or Postgres.app. During the installation:
   - choose the port 5433, or keep 5432 and write that number in `DATABASE_URL` (step 4) and in the commands below;
   - note the password asked for the `postgres` superuser. It belongs to the installation; it is not the one in
     `.env`.
2. Open `psql` and sign in as that superuser. `psql` is the program that sends SQL commands to the server. There are
   two ways to open it. Use one of them, because the two ways differ.
   - **"SQL Shell (psql)" in the Start menu on Windows.** The window asks for the server, the database, the port, the
     username and the password, one after another. Press Enter to accept the value in brackets, but type your port at
     the port question. When the line `postgres=#` appears, `psql` is already running. Do not type the `psql` command
     shown below into this window, because `psql` would read it as the beginning of an SQL statement.
   - **A terminal.** On Windows `psql` is in the `bin` folder of the installation. Type this command:

     ```sh
     psql -h 127.0.0.1 -p 5433 -U postgres
     ```

   At the line `postgres=#`, type `SHOW port;`. `psql` prints the port the server listens on, and that number must be
   the port in `DATABASE_URL`.

3. Create the role and the database the site uses. Type the two statements below at the line `postgres=#`, one at a
   time, and press Enter after each. Each statement ends with a semicolon. If the line changes to `postgres-#`, `psql`
   is still waiting for the end of a statement, so type `\r` to clear what it holds and start again.

   The password is the one in `DATABASE_URL` of your `.env`. SQL needs the single quotes around it, and they are not
   part of the password. In `.env` the password has no quotes at all.

   ```sql
   CREATE ROLE klub LOGIN CREATEDB PASSWORD '<the password from .env>';
   CREATE DATABASE klub OWNER klub;
   ```

   `psql` answers `CREATE ROLE` to the first statement and `CREATE DATABASE` to the second.
   - `CREATEDB` is for `npm run test:server`: each test makes and drops a database of its own.
   - `OWNER klub` matters: since PostgreSQL 15 only the owner of a database may create tables in its `public` schema,
     which is where `db:migrate` creates them.
   - The role needs nothing more. The migrations use no extension and no statement reserved to a superuser; in the
     container the role is a superuser only because the image makes it one.

4. Check that the role can sign in. In the same `psql` window, type `\c klub klub`, which connects to the database
   `klub` as the role `klub`. Give the password from `.env` if `psql` asks for it. The line changes to `klub=>`. Then
   type `SELECT 1;`, which prints `1`, and `\q`, which closes `psql`.

   From a terminal, this one command does the same check:

   ```sh
   psql -h 127.0.0.1 -p 5433 -U klub -d klub -c "select 1"
   ```

5. Continue with step 6.

Differences from the container:

- The server reads `DATABASE_URL` only. `POSTGRES_PASSWORD` is read by the compose file alone; keep the line with the
  same password or leave it empty.
- PostgreSQL runs as a service of the system and normally starts with the computer, so the `docker compose` commands
  of steps 10 and 11 are not needed.
- To start from an empty database (the `down -v` of step 10), run as `postgres` `DROP DATABASE klub WITH (FORCE);` and
  `CREATE DATABASE klub OWNER klub;`, then step 6 again.

When it fails:

- **`syntax error at or near "psql"`**: the `psql` command of step 2 was typed inside `psql`. Without a semicolon at its
  end, `psql` joined it to the next line and sent both as one statement, so `CREATE ROLE` did not run. `CREATE DATABASE`
  then fails with `role "klub" does not exist`, and nothing has been created. Type the two statements of step 3 alone.
- **`role "klub" does not exist`**: step 3 was not done on the server that `DATABASE_URL` points at (check the port).
  A PostgreSQL installed in another language writes this message in that language, and the terminal may show it as
  unreadable characters; the error is then recognised by `routine: 'InitializeSessionUserId'` printed with it. The
  same routine reports a role created without `LOGIN`.
- **`password authentication failed for user "klub"`**: the password in `DATABASE_URL` is not the one given in step
  3, or it is written in quotes. Node keeps quotes that stand inside a value (this one starts with `postgres://`), so
  they become part of the password. Write it bare, or set the role's password again as `postgres`:
  `ALTER ROLE klub PASSWORD '<the password from .env>';`.
- **`database "klub" does not exist`**: the second line of step 3 is missing.
- **`permission denied for schema public`** during `db:migrate`: the database was created without `OWNER klub`. Drop it
  and create it again as in step 3.

## What this repository does not hold

By design the repository has no real member accounts, no passwords or keys, no mail credentials, no video files and
no sources of the members-only lectures. A lecture that is for members only is shown to you with a notice, not
played. To try the player with a file of your own, see `VIDEO_ROOT` in `.env.example`.

More detail: `README.md` (what each part is and how it was checked), `REWRITE.md` (the decisions and the session
log), `SUPERUSER.md` (the administrator's role and recovery), and `specs/001-self-hosted-club-site/quickstart.md`.

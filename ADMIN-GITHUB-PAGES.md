# Running the club's site while it lives on GitHub Pages

Written 2026-10-02 at the owner's request. A step-by-step guide for the people who run the club's site: how a new post
gets from an idea onto the live site, and how a member is created and given a status.

**Superseded 2026-10-12 (T100).** A post or a video no longer goes through git and `main`: it is saved by the club's
own backend and is on the site at once for a signed-in viewer and within seconds for a visitor. The steps below
describe the old arrangement and are kept only as history.

**This file is temporary.** It describes the site as it is today: a static site on GitHub Pages
(`https://debi7.github.io/`), with the admin panel's services running only on the owner's computer. When the hosting
changes, this file goes; [ADMIN.md](ADMIN.md) stays and describes the panel itself.

## 1. What works where today

GitHub Pages serves files and runs no programs. The three small services the panel and the paid lectures need
(ADMIN.md section 8) are not deployed anywhere yet, so they run only on the owner's computer with `npm run dev:all`.

| Task                                     | On the live site (GitHub Pages)    | On the owner's computer (`npm run dev:all`)          |
| ---------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| Sign up, sign in, the account page       | works                              | works                                                |
| See one's own status on the account page | works                              | works                                                |
| Give or change a member's status         | not from the site; Clerk Dashboard | works, and takes effect on the live site at once     |
| Add, edit, copy, delete a post           | no                                 | works; reaches the live site through git (section 3) |
| Watch a paid lecture                     | no: "Видео сейчас недоступно"      | works, with the lecture listed in the local service  |

Two things follow from this table:

- **A status is live at once.** The live site and the owner's computer use the same Clerk account (the "development
  instance"), so a status given on the owner's computer, or in the Clerk Dashboard, is the member's status on the live
  site too.
- **A post is not live at once.** The panel on the owner's computer writes the post as a file in the project folder.
  The live site gets it only when that file is committed, pushed, and merged into the branch `main`, which is what
  GitHub Pages builds the site from (section 3, step 5).

On the live site the admin pages, once their code is merged into `main`, open but say that the service is not
connected yet. That is expected until the services are deployed (ADMIN.md section 7).

## 2. Before the first time

Once per computer, the owner does the setup of [ADMIN.md](ADMIN.md) section 3: the session token in the Clerk
Dashboard, their own status `admin`, a secret key for this computer saved with `npm run statuses:key`, and
`workers/statuses/settings.local.json` with their user id. (Changed 2026-10-11, T071: the status service is gone, this part is history.) Section 3, step 6 there says how to check that it works.

Everyone else needs only an account on the site with the status `metr` or `admin` (section 4), and access to the
owner's computer or the owner's help: today the panel runs nowhere else.

## 3. A new post, from idea to the live site

### Step 1. Start the panel

1. In the project folder, run `npm run dev:all`. Wait for the line with `http://localhost:4321/`.
2. Open <http://localhost:4321/auth/signin/> and sign in with an account whose status is `metr` or `admin`.
3. Open <http://localhost:4321/admin/posts/>, or go there from the account page ("Публикации").

You see the list of posts, 20 to a page, and the button "Новая публикация".

### Step 2. Write the post

Press **Новая публикация** for an empty form, or **Копировать** next to a post that looks like the new one: the copy
has every field and the text already filled in, a free address, " (копия)" after the title and today's date (ADMIN.md
section 4 has the details).

Fill in the form:

- **Заголовок** - the title, as readers will see it.
- **Адрес** - the end of the post's web address: `poisk-vody` gives `https://debi7.github.io/posts/poisk-vody/`.
  Latin lower-case letters, digits and hyphens only; not only digits (those are the year pages) and not `page`. It must
  be unique, and it cannot be changed after the first save, because the comments hang on it.
- **Дата публикации** - club time (UTC+3). A post dated in the future appears on the live site only with the first
  build after that date (section 6).
- **Краткое описание** - one or two sentences; shown in lists, in search results and when the link is shared.
- **Теги** and **Категории** - comma-separated. The buttons under each field are the tags and categories the site
  already uses; click one to add it, so that the post joins the existing tag page instead of starting a near-duplicate.
- **Черновик** - ticked: the post is saved but not shown on the live site. Untick it when the post is ready.
- **Текст** - the post itself, in Markdown. The short version is below; [CONTENT.md](CONTENT.md), "Writing", has more.

Markdown in short:

- A blank line starts a new paragraph.
- `## Section title` makes a section heading, `### Subsection` a smaller one. Do not use a single `#`: the title above
  is the page's only top heading.
- `**bold**`, `*italic*`.
- A list: each line starts with `- `; a numbered list with `1. `, `2. `.
- A link: `[the words to click](https://example.com/page)`. Links may go to web pages, to `mailto:` addresses and to
  pages of the site (`/posts/...`).
- A quotation: the line starts with `> `.
- HTML tags are refused by the panel. Code goes between backticks: `` `like this` ``.
- Pictures cannot be added through the panel yet; a post with pictures is done by hand (CONTENT.md, "Images in a
  post").

### Step 3. Save

Press **Сохранить**. On the owner's computer the panel writes the file `src/content/posts/<address>.md` in the project
folder, and the post is at once on the local site. If a field is wrong, the panel marks it and says why; nothing is
saved until every field is right. If the address is taken, the panel proposes a free one; check it and save again.

### Step 4. Check it on the owner's computer

- <http://localhost:4321/posts/address/> with the real address - the post itself (drafts and future posts are shown
  here, on the live site they are not).
- <http://localhost:4321/posts/> - the list, newest first.
- <http://localhost:4321/search/> - search for a word from the post.
- The tag and category pages it belongs to, and the tag cloud on the home page.

To change something, press **Изменить** in the list, correct, save again. To throw the post away before it was ever
published, press **Удалить**.

### Step 5. Publish it on GitHub Pages

This part is the owner's, in a terminal in the project folder. Only the owner pushes to GitHub, and only the
colleague merges into `main`.

1. See what changed: `git status`. The new post shows as `src/content/posts/<address>.md`.
2. Run the checks, all of which must pass:

   ```
   npm run fix
   npm run check
   npm run build
   npm run check:pages
   ```

   If `npm run build` stops, its message names the file and the field; correct the post in the panel and run it again.

3. Commit the post on its own, not together with other changes:

   ```
   git add src/content/posts/<address>.md
   git commit -m "Add the post <address>"
   ```

   An edited post: the same, with "Edit the post" in the message. A deleted post: the same `git add` with its old
   file name, which records the deletion, and "Delete the post" in the message.

4. Push the working branch: `git push origin fix-bugs-v2` (or whichever branch the work is on today; `git status`
   names it in its first line).
5. On GitHub, open the repository `Debi7/Debi7.github.io`, and open a pull request from that branch into `main` (or use
   the one that is already open). Ask the colleague to merge it. Only a merge into `main` publishes: GitHub Pages builds
   the site from `main` and from nothing else.
6. After the merge, open the repository's **Actions** tab. The run "Deploy to GitHub Pages" takes about two minutes; a
   green tick means the site is published. A red cross means the build failed: the site stays exactly as it was, and
   the log names the file and the field.
7. Open `https://debi7.github.io/posts/<address>/`. If the old page shows, reload it with Ctrl+F5.

Whoever has write access to the repository can also skip the branch and add the file on the GitHub website, straight
on `main`, as CONTENT.md "Create a post" describes: copy the text of `src/content/posts/<address>.md` from the owner's
computer into "Add file" -> "Create new file" under the same name.

## 4. A new member, and their status

### Step 1. The account

Either way gives an account with no status, which the site counts as **гость**:

- **The person signs up themselves** at `https://debi7.github.io/auth/signup/`: email address, password, and the code
  Clerk sends to that address. This is the usual way.
- **An administrator creates the account** in the Clerk Dashboard: **Users** -> **Create user**, with the person's
  email address and a password, and tells them both; they can change the password on their account page under
  "Безопасность".

### Step 2. The status

Who may give what is in ADMIN.md section 2: a metr gives student, expert, master or blocked; only an admin gives metr
or admin; nobody gives guest, and nobody changes their own status.

**In the panel (preferred: it checks the rules and records who did it):**

1. On the owner's computer, `npm run dev:all`, sign in as a metr or an admin, open
   <http://localhost:4321/admin/users/>.
2. Find the member by name or email, choose the status in their row, press **Применить**, confirm.

The change is in Clerk at once, so it holds on the live site too.

**In the Clerk Dashboard (when the panel cannot be run):**

1. **Users** -> the member -> **Metadata** -> **Public** -> **Edit**.
2. Add or change the line `"status"`, keeping whatever else is there:

   ```json
   {
     "status": "student"
   }
   ```

   The value is one of `student`, `expert`, `master`, `metr`, `admin`, `blocked`, in lower case and in quotes.

3. When blocking this way, also add `"statusBy": "admin"` or `"statusBy": "metr"`: the member's account page says who
   closed their access, and without the line it names the metr. The panel writes that line by itself.
4. **Save**.

The Dashboard does not check the rules of ADMIN.md section 2, and does not record who made the change; that is why
the panel is preferred.

### Step 3. What the member sees

- On the live site, on `/auth/account/` (after a reload): their status inside the account card, between "Профиль" and
  the email addresses. A metr or an admin also sees the links "Публикации" and "Пользователи".
- Paid lectures: **not on GitHub Pages today** - every member sees "Видео сейчас недоступно", because the service that
  hands out the lecture is not deployed. On the owner's computer they open for student, expert, master, metr and admin
  (PAID-VIDEO.md, the local service and its list of lectures).

### Changing, blocking, removing

- Another status, or a block, or lifting a block: the same steps as above. A blocked member can still sign in but
  opens no material, and their account page says who closed it.
- Removing an account altogether: Clerk Dashboard -> **Users** -> the member -> **Delete user**. The panel cannot do
  this. A member who should only lose access is better blocked: blocking can be undone, deleting cannot.

## 5. When the hosting changes

This whole file then stops applying. What stays:

- The panel itself and its rules: ADMIN.md.
- On a host that can run the services (or with them deployed on Cloudflare, ADMIN.md section 7), a post saved in the
  panel is published by the panel itself, with no git step, and the panel works on the live site for every metr and
  admin. The paid lectures need their service deployed the same way (PAID-VIDEO.md).

## 6. When something does not show up

Check in this order:

1. **Draft**: the "Черновик" tick is off.
2. **Date**: the date has passed. A post dated later appears only with the first build after that date; with GitHub
   Pages a build happens only on a merge into `main`, so a future-dated post may wait for the next merge.
3. **The build ran**: the Actions tab shows a green "Deploy to GitHub Pages" after the merge.
4. **The browser's copy**: reload with Ctrl+F5.
5. **A status that does not show**: reload the account page; the services read the status from the session, which
   Clerk renews every minute.

The panel's own messages, and what each one means, are in ADMIN.md section 6.

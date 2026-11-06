import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { uploadConfig } from "../../api/drafts";
import type { UploadInfo } from "../../api/types";
import { FakeUploadXhr } from "../../test/fakeUploadXhr";
import { createMockMail } from "../../test/mockMail";
import { renderApp } from "../../test/renderApp";
import { composeConfig } from "./session";

const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
  uploadConfig.createXhr = () => new FakeUploadXhr() as unknown as XMLHttpRequest;
});
afterEach(() => {
  server.resetHandlers();
  composeConfig.autosaveMs = 2000;
});
afterAll(() => server.close());

type Mail = ReturnType<typeof createMockMail>;

function setup(url = "/u/0/inbox", prepare?: (mail: Mail) => void) {
  const mail = createMockMail();
  prepare?.(mail);
  server.use(...mail.handlers);
  const user = userEvent.setup();
  return { mail, user, ...renderApp(url) };
}

const png = (name = "wykres.png") => new File(["png-bytes"], name, { type: "image/png" });

/** A paste of files into the editor, as the browser fires it. */
function pasteFiles(target: Element, files: File[]) {
  fireEvent.paste(target, {
    clipboardData: { files, types: ["Files"], getData: () => "", items: [] },
  });
}

async function openCompose(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("grid");
  await user.keyboard("c");
  return screen.findByRole("dialog", { name: "Nowa wiadomość" });
}

it("uploads a pasted picture inline and saves cid: in bodyHtml with the upload pinned", async () => {
  composeConfig.autosaveMs = 50;
  const { mail, user } = setup();
  const win = await openCompose(user);
  const body = within(win).getByRole("textbox", { name: "Treść wiadomości" });
  pasteFiles(body, [png()]);

  const img = await waitFor(() => {
    const el = body.querySelector("img[data-cid]");
    expect(el).not.toBeNull();
    return el!;
  });
  expect(mail.state.calls.uploadInline).toEqual([true]);
  // The editor shows the upload itself; the server gets the cid it generated.
  expect(img).toHaveAttribute("src", "/api/v1/attachments/u_1?inline=1");
  expect(img).toHaveAttribute("data-cid", "c1@silo");
  await waitFor(() =>
    expect(mail.state.calls.putDraft.at(-1)).toMatchObject({ attachmentIds: ["u_1"] }),
  );
  const saved = mail.state.calls.putDraft.at(-1)!.bodyHtml;
  expect(saved).toContain('src="cid:c1@silo"');
  expect(saved).not.toContain("data-cid");
  // Inline pictures are not listed as attachments.
  expect(within(win).queryByRole("list", { name: "Załączniki" })).toBeNull();

  // Removing the picture from the text unpins the upload.
  body.focus();
  await user.keyboard("{Control>}a{/Control}{Backspace}");
  await waitFor(() =>
    expect(mail.state.calls.putDraft.at(-1)).toMatchObject({ attachmentIds: [] }),
  );
  expect(mail.state.calls.putDraft.at(-1)!.bodyHtml).not.toContain("<img");
});

it("puts other pasted files in the attachments, not in the text", async () => {
  const { mail, user } = setup();
  const win = await openCompose(user);
  const body = within(win).getByRole("textbox", { name: "Treść wiadomości" });
  pasteFiles(body, [new File(["pdf"], "umowa.pdf", { type: "application/pdf" })]);
  const list = await within(win).findByRole("list", { name: "Załączniki" });
  expect(await within(list).findByText("umowa.pdf")).toBeInTheDocument();
  expect(mail.state.calls.uploadInline).toEqual([false]);
  expect(body.querySelector("img")).toBeNull();
});

it("shows the cid: pictures of a draft from the server through their uploads", async () => {
  const inline: UploadInfo = {
    id: "u_77",
    filename: "logo.png",
    size: 9,
    contentType: "image/png",
    inline: true,
    cid: "logo@silo",
    thumbnail: true,
  };
  const { user } = setup("/u/0/drafts", (m) => {
    m.state.uploads.set(inline.id, inline);
    m.addDraftThread(9, {
      bodyHtml: '<p>Logo:</p><img src="cid:logo@silo" alt="logo.png">',
      attachments: [inline],
    });
  });
  await user.click(await screen.findByRole("row", { name: /Szkic 9/ }));
  const win = await screen.findByRole("dialog", { name: "Szkic 9" });
  const body = within(win).getByRole("textbox", { name: "Treść wiadomości" });
  await waitFor(() =>
    expect(body.querySelector("img")).toHaveAttribute("src", "/api/v1/attachments/u_77?inline=1"),
  );
  expect(body.querySelector("img")).toHaveAttribute("data-cid", "logo@silo");
  expect(within(win).queryByRole("list", { name: "Załączniki" })).toBeNull();
});

it("forward carries the original's attachments and reports what was left out", async () => {
  composeConfig.autosaveMs = 50;
  const report: UploadInfo = {
    id: "u_50",
    filename: "raport.pdf",
    size: 1200,
    contentType: "application/pdf",
    inline: false,
    cid: null,
    thumbnail: false,
  };
  const photo: UploadInfo = {
    ...report,
    id: "u_51",
    filename: "zdjecie.jpg",
    contentType: "image/jpeg",
    thumbnail: true,
  };
  const { mail, user } = setup("/u/0/inbox/t_1", (m) => {
    m.state.forwardExtra = { attachments: [report, photo], warnings: ["attachments_unavailable"] };
  });
  await screen.findByRole("heading", { name: "Temat 1" });
  await user.keyboard("f");
  const win = await screen.findByRole("dialog", { name: "Fwd: Temat 1" });
  expect(
    await screen.findByText("Nie udało się pobrać części załączników oryginału."),
  ).toBeInTheDocument();
  const list = within(win).getByRole("list", { name: "Załączniki" });
  expect(within(list).getByText("raport.pdf")).toBeInTheDocument();
  // A picture shows its thumbnail (UploadInfo.thumbnail), other files the type icon.
  expect(list.querySelector('img[src="/api/v1/attachments/u_51/thumbnail?size=s"]')).not.toBeNull();
  await user.click(within(list).getByRole("button", { name: /raport\.pdf/ }));
  await user.type(within(win).getByRole("combobox", { name: "Do" }), "dev2@silo.test,");
  await waitFor(() =>
    expect(mail.state.calls.putDraft.at(-1)).toMatchObject({ attachmentIds: ["u_51"] }),
  );
});

it("shows thumbnails of attachments in the thread and previews pictures at natural size", async () => {
  const { user } = setup("/u/0/inbox/t_1", (m) => {
    m.state.messageAttachments = [
      {
        id: "a_7",
        filename: "plan.png",
        contentType: "image/png",
        size: 52000,
        inline: false,
        downloaded: true,
        thumbnail: true,
      },
      {
        id: "a_8",
        filename: "umowa.pdf",
        contentType: "application/pdf",
        size: 284113,
        inline: false,
        downloaded: true,
        thumbnail: false,
      },
    ];
  });
  const list = await screen.findByRole("list", { name: "Załączniki" });
  const thumb = list.querySelector("img")!;
  expect(thumb).toHaveAttribute("src", "/api/v1/attachments/a_7/thumbnail?size=s");
  expect(thumb).toHaveAttribute("loading", "lazy");
  // A failing thumbnail falls back to the type icon.
  fireEvent.error(thumb);
  expect(list.querySelector("img")).toBeNull();
  // PDF opens in a new tab inline; every attachment can be downloaded.
  expect(within(list).getByRole("link", { name: /Podgląd: umowa\.pdf/ })).toHaveAttribute(
    "href",
    "/api/v1/attachments/a_8?inline=1",
  );
  expect(within(list).getByRole("link", { name: /Pobierz plan\.png/ })).toHaveAttribute(
    "href",
    "/api/v1/attachments/a_7",
  );
  await user.click(within(list).getByRole("button", { name: /Podgląd: plan\.png/ }));
  const dialog = await screen.findByRole("dialog", { name: "plan.png" });
  expect(within(dialog).getByRole("img", { name: "plan.png" })).toHaveAttribute(
    "src",
    "/api/v1/attachments/a_7?inline=1",
  );
});

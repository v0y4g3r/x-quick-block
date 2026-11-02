# X Quick Block

A Chrome Manifest V3 extension that adds a `Block` button next to author names in posts and replies on x.com and twitter.com. Supports dynamically loaded posts and in-page navigation.

## Installation

1. Download and extract this repository, or clone it:
   ```sh
   git clone https://github.com/v0y4g3r/x-quick-block.git
   ```
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `x-quick-block` folder containing `manifest.json`.
5. Refresh any open X tabs and sign in to use the extension.

**No dependency installation, build step, or API key is required.** If you have an extension ZIP, extract it first; Chrome's **Load unpacked** option cannot load ZIP files directly.

## Usage

Click `Block` next to an author. The extension opens that post's native menu, verifies the `@handle`, selects the native block action, and automatically confirms it. **One click performs a real block without asking for additional confirmation.** To undo a block, use X's blocked accounts settings.

Other Block buttons are temporarily disabled while an operation is in progress to avoid overlapping menus. After submission, buttons for the same account on the current page display `已提交` (Submitted). The extension does not hide posts itself; X controls whether they disappear.

The Block button is in English; status messages and notifications are currently in Chinese.

## Safety and Limitations

- Runs only on X and Twitter HTTPS pages. Does not request storage, cookie, or additional browser permissions.
- No background service, login-token access, private API calls, or data uploads.
- Acts only on the author you explicitly click; does not perform automatic bulk blocking.
- Asks you to close any existing menu or dialog before starting.
- Both the menu and confirmation dialog must contain the target account's `@handle`. If they do not match, the extension stops rather than selecting another action or unblocking anyone.
- Submitted means the native confirmation button was clicked and the dialog disappeared; **it is not server-side verification of success**. Check X's feedback and blocked accounts list. If a network error occurs, refresh the page before retrying.
- Your own posts, ads, or already-blocked accounts may not offer a native block action. In that case, the operation times out and prompts you to handle it manually.
- X redesigns, experimental interfaces, menus without handles, or changes to confirmation dialogs may break automation. The extension does not guess which button to click. A timeout may leave a native menu or dialog open; close or handle it manually.
- Automated tests use a simulated DOM. The extension has not been verified against a real, signed-in X account. For your first attempt, choose an account you genuinely want to block and check the result.

## Development and Testing

```sh
npm ci
npm test
node --check content.js
```

After making changes, reload the extension at `chrome://extensions/`, then refresh your X tab.

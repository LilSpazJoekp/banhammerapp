# BanHammer App

BanHammer App is a tool for moderators to quickly and easily ban spammers from multiple subreddits at once.

**Note: BanHammer will only ban in subreddits the app is installed and the moderator utilizing it has at least the
'access' permission.**

## Configuration

To utilize BanHammer App, you must at least have the `access` permission in **EVERY** subreddit you wish to ban or add
mod notes in.

After installing, you can configure the following options on the app's settings page:

- **Default Ban Subreddits**: Other subreddits to ban from by default. If left blank, the user will only be banned from
  this subreddit. One subreddit per line, case-insensitive. Will only ban in subreddits where BanHammer is installed and
  the invoking moderator is also a moderator with the appropriate permissions.
- **Enable Ban Allow List?**: If checked, ONLY the subreddits listed in the 'Allowed Ban Subreddits' field will be able
  to ban users in this subreddit.
- **Allowed Ban Subreddits**: List of subreddits that are allowed to ban in your subreddit. If the allow list is
  enabled, only subreddits in this list will be able to ban in your subreddit. One subreddit per line, case-insensitive.
  Ignored if 'Enable Ban Allow List?' is disabled. Leave blank to deny all other subreddits from banning users in this
  subreddit.
- **Denied Ban Subreddits**: List of subreddits that are not allowed to ban in your subreddit. This is ignored if '
  Enable Ban Allow List?' is enabled. One subreddit per line, case-insensitive.
- **Default User Message**: The default message to send to the user when they are banned. Supports placeholders, see
  below for supported placeholders. For example, "Hello, u/{{author}}, you have been banned from r/{{subreddit}} for
  posting the following {{kind}} in {{originSubreddit}}: {{url}}.".
- **Default Mod Note Subreddits**: Other subreddits to add mod notes in by default. If left blank, the mod note will
  only be added in this subreddit. One subreddit per line, case-insensitive. Will only add mod notes in subreddits where
  BanHammer is installed and the invoking moderator is also a moderator with the appropriate permissions.
- **Enable Mod Note Allow List?**: If checked, ONLY the subreddits listed in the 'Allowed Mod Note Subreddits' field
  will be able to add mod notes to users in this subreddit.
- **Allowed Mod Note Subreddits**: List of subreddits that are allowed to add mod notes in your subreddit. If the allow
  list is enabled, only subreddits on this list will be able to add mod notes in your subreddit. One subreddit per line,
  case-insensitive. Ignored if 'Enable Mod Note Allow List?' is disabled. Leave blank to deny all other subreddits from
  adding mod notes in this subreddit.
- **Denied Mod Note Subreddits**: List of subreddits that are not allowed to add mod notes in your subreddit. This is
  ignored if 'Enable Mod Note Allow List?' is enabled. One subreddit per line, case-insensitive.
- **Default Mod Note Label**: Default Mod Note label. Defaults to 'Abuse Warning'. Must be one of the following:
    - Abuse Warning
    - Ban
    - Bot Ban
    - Helpful User
    - Perma Ban
    - Solid Contributor
    - Spam Warning
    - Spam Watch
- **Default Mod Note**: The default mod note to add to the user. Supports placeholders, see below for supported
  placeholders. For example, "User was banned from r/{{subreddit}} for posting the following {{kind}} in
  {{originSubreddit}}: {{url}}.".

### Supported Placeholders

The following placeholders are supported:

- `{{author}}`: The username of the user. This will automatically be prefixed with 'u/'.
- `{{body}}`: The body of the item. If there is no body, this will be empty.
- `{{kind}}`: The kind of item ('comment' or 'post').
- `{{originSubreddit}}`: The subreddit the ban was initiated in. This will automatically be prefixed with 'r/'.
- `{{subreddit}}`: The subreddit the item is posted to. This will automatically be prefixed with 'r/'.
- `{{title}}`: The title of the item (Posts only). If the item is a comment, this will be the title of the post the
  comment is on.
- `{{triggeringMod}}`: The username of the moderator who initiated the ban and/or mod note. This will automatically be
  prefixed with 'u/'.
- `{{url}}`: A link to the item.

## Usage

You can access the app through the 'BanHammer User' context menu option on any post or comment in your subreddit. After
selecting the context menu action, you will see a dialog box where you can configure the following options for the ban:

### Ban Configuration

- **Ban User?**: Toggle to ban the user in the specified subreddit(s).
- **Duration**: The duration of the ban in days. If set to 0, the ban will be permanent. Defaults to 0.
- **Additional Info/Ban Mod Note**: Additional information or a mod note to include with the ban. This is only visible
  to other moderators. Supports placeholders, see above for supported placeholders.
- **User Message**: A message to send to the user when they are banned. Supports placeholders, see above for supported
  placeholders. For example, "Hello, {{username}}, you have beenbanned from {{subreddit}} for posting excessive spam.".
  Defaults to the message set in the app's settings page.
- **Additional Ban Subreddits**: Additional subreddits to ban the user from. If left blank, the user will only be banned
  from the subreddit the ban was initiated in. One subreddit per line, case-insensitive. Defaults to the subreddits
  specified in the 'Other Subreddits' field on the app's settings page.

### Mod Note Configuration

- **Add Mod Note?**: Toggle to add a mod note for the user in the specified subreddit(s). Supports placeholders, see
  above for supported placeholders.
- **Mod Note Label**: Select a label for the mod note. Options include:
    - Abuse Warning
    - Spam Warning
    - Spam Watch
    - Solid Contributor
    - Helpful User
    - Ban
    - Bot Ban
    - Perma Ban
- **Mod Note**: Text for the mod note. This is only visible to other moderators.
- **Additional Mod Note Subreddits**: Additional subreddits to add a mod note in. If left blank, the mod note will only
  be added to the subreddit it was initiated in. One subreddit per line, case-insensitive.

## Known Issues

- Default Mod Note Label is not set when actioning a user. This should be resolved in a future release of Devvit.

## Feedback

If you have any feedback or suggestions for BanHammer, file a bug report or feature request on the
[GitHub page](https://github.com/LilSpazJoekp/banhammerapp).

## Changes

### 1.3.0

- Fixed a bug that would cause an unexpected crash when actioning a user if a mod note label was not selected.
- Fixed a bug where placeholders were not being replaced if the field contained duplicate placeholders.
- Added support for ``{{title}}``, ``{{body}}``, and ``{{triggeringMod}}`` placeholders.

### 1.2.1

- Added support for using placeholders in the "Additional Info/Ban Mod Note" field.
- Fixed a bug where banning would not work if the user message field was left blank.

### 1.1.3

- Update devvit version for vulnerability fix.

### 1.1.2

- Remove scheduled job for keeping settings in sync with wiki page.

### 1.1.1

- Revert setting name changes to restore previously set values.

### 1.1.0

- Added ability for adding mod notes to users.

### 1.0.3

- Improve ban performance.
- Improve error handling. Errors are now displayed if the subreddit you're trying to ban in is banned or not valid.

### 1.0.2

- Fixed an issue where the app couldn't be setup.

### 1.0.1

- Fixed an issue with the app not appearing in comment context menus.

### 1.0.0

- Initial release.

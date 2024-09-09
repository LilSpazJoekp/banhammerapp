# BanHammer App

BanHammer App is a tool for moderators to quickly and easily ban a user from multiple subreddits at once.

**Note: BanHammer will only ban in subreddits the app is installed and the moderator utilizing it has at least the
'access' permission.**

## Usage

To use BanHammer App, you must at least have the `access` permission in every subreddit you wish to ban in.

After installing, you can configure the following options in the app's settings page:

- **Other Subreddits**: The subreddits you want to ban from by default. If left blank, the user will only be banned from
  this subreddit. One subreddit per line, case-insensitive.
- **Enable Allowlist?**: If checked, ONLY this subreddit and the subreddits listed in the 'Allowed Subreddits' field
  will be able to ban users in this subreddit.
- **Allowed Subreddits**: List of subreddits that are allowed to ban in your subreddit. If the allowlist is enabled,
  only subreddits on this list will be able to ban in your subreddit. One subreddit per line, case-insensitive.
- **Denied Subreddits**: List of subreddits that are not allowed to ban in your subreddit. This is ignored if 'Enable
  Allowlist' is enabled. One subreddit per line, case-insensitive.
- **Default User Message**: The default message to send to the user when they are banned. Supports placeholders, see
  below for supported placeholders. For example, "Hello, u/{{author}}, you have been banned from r/{{subreddit}} for
  posting following {{kind}} in {{originSubreddit}}: {{url}}.".
    - The following placeholders are supported:
        - `{{author}}`: The username of the user being banned.
        - `{{kind}}`: The kind of item the user is being banned for ('comment' or 'post').
        - `{{subreddit}}`: The subreddit the user is being banned in.
        - `{{originSubreddit}}`: The subreddit the ban was initiated in.
        - `{{url}}`: A link to the item the user is being banned for.

You can access the app though the 'BanHammer User' context menu option on any post or comment in your subreddit. After
selecting the context menu action, you will see a dialog box where you can configure the following options for the ban:

- **Duration**: The duration of the ban in days. If set to 0, the ban will be permanent. Defaults to 0.
- **Additional Info/Mod Note**: Additional information or a mod note to include with the ban. This is only visible to
  other moderators.
- **User Message**: A message to send to the user when they are banned. For example, "Hello, {{username}}, you have been
  banned from {{subreddit}} for posting excessive spam.". Defaults to the message set in the app's settings page.
- **Additional Subreddits**: Additional subreddits to ban the user from. If left blank, the user will only be banned
  from the subreddit the ban was initiated in. Defaults to the subreddits specified in the 'Other Subreddits' field on
  the app's settings page.

## Feedback

If you have any feedback or suggestions for BanHammer App, please contact my author, u/Lil_SpazJoekp, on Reddit.

## Changes

### 1.0.3

- Improve ban performance.
- Improve error handling. Errors are now displayed if the subreddit you're trying to ban in is banned or not valid.

### 1.0.2

- Fix issue where the app couldn't be setup.

### 1.0.1

- Fix issue with the app not appearing in comment context menus.

### 1.0.0

- Initial release.

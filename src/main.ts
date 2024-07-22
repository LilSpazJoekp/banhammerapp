import {ModAction} from "@devvit/protos";
import {
    Comment,
    Context,
    Data,
    Devvit,
    Form,
    FormOnSubmitEvent,
    MenuItemOnPressEvent,
    OnTriggerEvent,
    Post,
    RedditAPIClient,
    SettingScope,
    SettingsFormFieldValidatorEvent,
    Subreddit,
    TriggerContext,
    User,
    WikiPage,
} from "@devvit/public-api";

const APP_SLUG: string = "banhammerapp";
const WIKI_PAGE: string = "app_config/banhammerapp";

interface BanHammerSettings {
    allowlist: string[];
    denylist: string[];
    enableAllowlist: boolean;
    lastUpdated: string
}

interface otherSubredditCheckParams {
    context: Context;
    otherSubreddit: Subreddit;
}

Devvit.configure({
    redditAPI: true,
    redis: true,
});

Devvit.addSettings([
        {
            helpText: "One subreddit per line, case-insensitive. Other subreddits to ban in by default. Will only ban in subreddits where BanHammer is installed and the invoking moderator is also a moderator.",
            label: "Other Subreddits",
            name: "otherSubreddits",
            scope: SettingScope.Installation,
            type: "paragraph",
        },
        {
            type: "group",
            label: "Subreddit Allow List",
            fields: [
                {
                    helpText: "If checked, ONLY the subreddits listed in the 'Allowed Subreddits' field will be able to ban users in this subreddit.",
                    label: "Enable Allowlist?",
                    name: "enableAllowlist",
                    scope: SettingScope.Installation,
                    type: "boolean",
                },
                {
                    helpText: "One subreddit per line, case-insensitive. ONLY these subreddits can ban users in this subreddit. Ignored if 'Enable Allowlist?` is disabled. Leave blank to deny all other subreddits.",
                    label: "Allowed Subreddits",
                    name: "subredditAllowlist",
                    scope: SettingScope.Installation,
                    type: "paragraph",
                },
            ],
        },
        {
            helpText: "One subreddit per line, case-insensitive. A list of subreddits that are not allowed to ban users in this subreddit. Ignored if 'Enable Allowlist?` is enabled.",
            label: "Denied Subreddits",
            name: "subredditDenylist",
            scope: SettingScope.Installation,
            type: "paragraph",
            onValidate: validateSetting,
        },
        {
            helpText: "Default message to user. See app directory page for placeholder details.",
            label: "Default User Message",
            name: "defaultUserMessage",
            scope: SettingScope.Installation,
            type: "paragraph",
        },
    ],
);

Devvit.addTrigger({
    event: "ModAction",
    onEvent: onEventHandler,
});

Devvit.addMenuItem({
    forUserType: "moderator",
    label: "BanHammer User",
    location: ["comment", "post"],
    onPress: onPressHandler,
});

const banForm = Devvit.createForm(
    generateBanForm,
    banFormOnSubmitHandler,
);


async function onPressHandler(event: MenuItemOnPressEvent, context: Context) {
    const {redis, settings, ui, userId} = context;
    await redis.set(`${userId}_context`, JSON.stringify(event))
    ui.showForm(
        banForm,
        {
            defaultUserMessage: await settings.get("defaultUserMessage") || "",
            subreddits: await settings.get("otherSubreddits") || "",
        },
    )
}

function replaceTokens(message: string, banItem: Comment | Post, remoteSubreddit: Subreddit): string {
    return message
        .replace("{{author}}", banItem.authorName)
        .replace("{{kind}}", banItem instanceof Comment ? "comment" : "post")
        .replace("{{originSubreddit}}", banItem.subredditName)
        .replace("{{subreddit}}", remoteSubreddit.name)
        .replace("{{url}}", getContextLink(banItem));
}

function generateBanForm(data: Data): Form {
    let {defaultUserMessage, subreddits} = data;
    return {
        fields: [
            {
                defaultValue: 0,
                helpText: "Duration in days. 0 for permanent.",
                label: "Duration",
                name: "duration",
                required: true,
                type: "number",
            },
            {
                helpText: "Additional details or reason for the ban. Will not be sent to the user.",
                label: "Additional Info/Mod Note",
                name: "reason",
                required: false,
                type: "string",
            },
            {
                defaultValue: defaultUserMessage || "",
                helpText: "Message to send to user.",
                label: "User Message",
                name: "userMessage",
                type: "paragraph",
            },
            {
                defaultValue: subreddits || "",
                helpText: "Additional subreddits to ban in. Leave blank to only ban in the current subreddit. One subreddit per line, case-insensitive.",
                label: "Additional Subreddits",
                name: "additionalSubreddits",
                type: "paragraph",
            },
        ],
        title: "Ban User",
    };
}

function filterWikiPageComment(content: string) {
    return content.split("\n").filter((line) => !line.startsWith("#")).join("\n");
}

function loadSubredditSettings(wikiPage: WikiPage): BanHammerSettings {
    console.log(`Loading settings for r/${wikiPage.subredditName}`)
    return JSON.parse(
        filterWikiPageComment(wikiPage.content)
        || '{"allowlist":[],"denylist":[],"enableAllowlist":false,"lastUpdated":""}');
}

async function writeConfigToWikiPage(wikiPage: WikiPage, settings: BanHammerSettings) {
    await wikiPage.update(
        `# BanHammer Configuration
# This page is used to store the configuration for the BanHammer app.
# Do not edit this page manually, edit the settings for BanHammer [here](https://developers.reddit.com/r/${(
            wikiPage.subredditName
        )}/apps/${APP_SLUG}) instead.\n${(
            JSON.stringify(settings)
        )}`,
        `Updated settings for BanHammer`,
    );
}

function parseSubredditString(value: string | undefined) {
    return Array.from(
        new Set((
                value || ""
            )
                .toLowerCase()
                .split("\n")
                .map((s) => s.trim())
                .filter((s) => s !== ""),
        ),
    );
}

async function validateSetting(
    _: SettingsFormFieldValidatorEvent<string>,
    context: Context,
) {
    const {reddit, redis} = context;
    // await context.modLog.add({action: "dev_platform_app_changed", details: "Updated BanHammer settings"});
    const subreddit = await reddit.getCurrentSubreddit();
    const wikiPage = await ensureWikiPage(reddit, subreddit);
    await redis.set("wiki_update_required", "true");
    await writeConfigToWikiPage(
        wikiPage,
        {allowlist: [], denylist: [], enableAllowlist: false, lastUpdated: new Date().toISOString()},
    );
}

async function checkModPermissions(
    {context, otherSubreddit}: otherSubredditCheckParams,
): Promise<boolean> {
    console.log(`Checking mod permissions for r/${otherSubreddit.name}`);
    const triggeringSubreddit = await context.reddit.getCurrentSubreddit();
    const triggeringMod = await context.reddit.getCurrentUser();
    const moderators = await otherSubreddit.getModerators({username: triggeringMod.username}).all()
    if (moderators.length < 1) {
        context.ui.showToast({
            appearance: "neutral",
            text: `You do not have permission to ban users${otherSubreddit.id !== triggeringSubreddit.id ? ` in r/${(
                otherSubreddit.name
            )}` : ""}!`,
        });
        return false
    }
    return true;
}

async function canBanInSubreddit(
    {context, otherSubreddit}: otherSubredditCheckParams,
): Promise<boolean> {
    console.log(`Checking if app can ban in r/${otherSubreddit.name}`)
    let appUser = await context.reddit.getAppUser();
    let moderators = await otherSubreddit.getModerators({username: appUser.username}).all()
    if (moderators.length === 0)
        return false
    const currentSubredditName = (
        await context.reddit.getCurrentSubreddit()
    ).name.toLowerCase();
    const wikiPage = await context.reddit.getWikiPage(otherSubreddit.name, WIKI_PAGE);
    const {allowlist, denylist, enableAllowlist} = loadSubredditSettings(wikiPage);
    console.log(`Checking if app can ban in r/${otherSubreddit.name} from r/${currentSubredditName} with allowlist ${allowlist} and denylist ${denylist}`)
    return enableAllowlist
        ? new Set(allowlist).has(currentSubredditName)
        : !new Set(denylist).has(currentSubredditName);
}

function getContextLink(target: Comment | Post) {
    if (target instanceof Post) {
        return `https://redd.it/${target.id.split("_")[1]}`;
    }
    return `https://www.reddit.com/r/${target.subredditName}/comments/${target.parentId.split("_")[1]}/_/${target.id.split(
        "_")[1]}`;
}

async function banFormOnSubmitHandler(event: FormOnSubmitEvent, context: Context) {
    const {reddit, redis, ui, userId} = context;
    const {additionalSubreddits, duration, reason, userMessage} = event.values;
    let triggeringSubreddit = await reddit.getCurrentSubreddit()
    let triggeringMod = await reddit.getCurrentUser()
    const {targetId, location} = JSON.parse(await redis.get(`${userId}_context`) || "{}");

    let item: Comment | Post = location === "comment"
        ? await reddit.getCommentById(targetId)
        : await reddit.getPostById(targetId);
    const targetUser: User = await reddit.getUserById(item.authorId || "")
    if (!await checkModPermissions({context, otherSubreddit: triggeringSubreddit}))
        return;
    let subredditsToBanFrom: Promise<Subreddit>[] = parseSubredditString(`${triggeringSubreddit.name}\n${additionalSubreddits}`)
        .map(subredditName => reddit.getSubredditByName(subredditName));
    let subsBannedFrom = 0;
    for (let otherSubreddit of await Promise.all(subredditsToBanFrom)) {
        if (await checkModPermissions({context, otherSubreddit})) {
            if (otherSubreddit.id === triggeringSubreddit.id || await canBanInSubreddit({context, otherSubreddit})) {
                try {
                    await otherSubreddit.banUser({
                        context: targetId,
                        duration: duration > 0 ? duration : undefined,
                        message: replaceTokens(userMessage, item, otherSubreddit),
                        note: reason,
                        reason: `Mass ban by u/${triggeringMod.username} from r/${triggeringSubreddit.name} utilizing the BanHammerApp.`,
                        username: targetUser.username,
                    });
                    console.log(`Banned from r/${otherSubreddit.name}`)
                    subsBannedFrom += 1
                } catch (e) {
                    console.error(`Error banning from r/${otherSubreddit.name}: ${e}`)
                    ui.showToast({
                        appearance: "neutral",
                        text: `Error while banning from r/${otherSubreddit.name}`,
                    });
                }
            }
        }
    }
    ui.showToast({
        appearance: "success",
        text: `Banned from ${subsBannedFrom} subreddit${subsBannedFrom === 1 ? "" : "s"}`,
    });
}

async function ensureWikiPage(reddit: RedditAPIClient, subreddit: Subreddit): Promise<WikiPage> {
    try {
        return await reddit.createWikiPage({
            subredditName: subreddit.name,
            page: WIKI_PAGE,
            content: '{"allowlist":[],"denylist":[],"enableAllowlist":false,"lastUpdated":""}',
        });
    } catch (e) {
    }
    return await reddit.getWikiPage(subreddit.name, WIKI_PAGE);
}

async function onEventHandler(event: OnTriggerEvent<ModAction>, context: TriggerContext) {
    const {reddit, redis, settings} = context;
    if (await redis.get("wiki_update_required") === "false") {
        return;
    }
    const appUser = await reddit.getAppUser();
    const {action, moderator} = event;
    if (action !== "wikirevise" || moderator?.name !== appUser.username) {
        return;
    }
    const subreddit = await reddit.getCurrentSubreddit();
    const wikiPage = await ensureWikiPage(reddit, subreddit);
    await redis.set("wiki_update_required", "false");
    await writeConfigToWikiPage(
        wikiPage,
        {
            allowlist: parseSubredditString(await settings.get("subredditAllowlist")),
            denylist: parseSubredditString(await settings.get("subredditDenylist")),
            enableAllowlist: await settings.get("enableAllowlist") || false,
            lastUpdated: new Date().toISOString(),
        },
    );
}

// noinspection JSUnusedGlobalSymbols
export default Devvit;

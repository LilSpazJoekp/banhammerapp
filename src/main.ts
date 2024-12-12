import {ModAction} from "@devvit/protos";
import {
    Comment,
    Context,
    Devvit,
    Form,
    FormOnSubmitEvent,
    JSONObject,
    MenuItemOnPressEvent,
    Post,
    SettingScope,
    SettingsFormFieldValidatorEvent,
    TriggerContext,
    User,
    UserNoteLabel,
} from "@devvit/public-api";
import {
    BanHammerSettingsKeys,
    loadSubredditSettings,
    parseFormField,
    writeConfig,
    writeConfigToWikiPage,
} from "./config.js";


enum BanHammerAction {
    Ban = "ban",
    ModNote = "modNote",
}

type OtherSubredditCheckParams = {
    action: BanHammerAction
    context: Context;
    otherSubreddit: string;
}

Devvit.configure({
    redditAPI: true,
    redis: true,
});

Devvit.addSettings([
    {
        defaultValue: false,
        label: "Enable Global Redis",
        name: "enableGlobalRedis",
        scope: SettingScope.App,
        type: "boolean",
    },
    {
        defaultValue: false,
        label: "Enable Mod Log Entry",
        name: "enableModLogEntry",
        scope: SettingScope.App,
        type: "boolean",
    },
]);

Devvit.addSettings([
        {
            type: "group",
            label: "Ban Settings",
            fields: [
                {
                    helpText: "One subreddit per line, case-insensitive. Other subreddits to ban in by default. Will only ban in subreddits where BanHammer is installed and the invoking moderator is also a moderator with the appropriate permissions.",
                    label: "Default Ban Subreddits",
                    name: "otherSubreddits",
                    scope: SettingScope.Installation,
                    type: "paragraph",
                },
                {
                    fields: [
                        {
                            ...validatedSetting("enableAllowlist", "Enable Ban Allow List?"),
                            helpText: "If checked, ONLY the subreddits listed in the 'Allowed Ban Subreddits' field will be able to ban users in this subreddit.",
                            scope: SettingScope.Installation,
                            type: "boolean",
                        },
                        {
                            ...validatedSetting("subredditAllowList", "Allowed Ban Subreddits"),
                            helpText: "One subreddit per line, case-insensitive. ONLY these subreddits can ban users in this subreddit. Ignored if 'Enable Ban Allow List?` is disabled. Leave blank to deny all other subreddits from banning users in this subreddit.",
                            scope: SettingScope.Installation,
                            type: "paragraph",
                        },
                    ],
                    label: "Subreddit Ban Allow List",
                    type: "group",
                },
                {
                    ...validatedSetting("subredditDenyList", "Denied Ban Subreddits"),
                    helpText: "One subreddit per line, case-insensitive. A list of subreddits that are not allowed to ban users in this subreddit. Ignored if 'Enable Ban Allow List?` is enabled.",
                    scope: SettingScope.Installation,
                    type: "paragraph",
                },
                {
                    helpText: "Default message to user. Supports placeholders. See app directory page for placeholder details.",
                    label: "Default User Message",
                    name: "defaultUserMessage",
                    scope: SettingScope.Installation,
                    type: "paragraph",
                },
            ],
        },
        {
            fields: [
                {
                    helpText: "One subreddit per line, case-insensitive. Other subreddits to add mod notes in by default. Will only add mod notes in subreddits where BanHammer is installed and the invoking moderator is also a moderator with the appropriate permissions.",
                    label: "Default Mod Note Subreddits",
                    name: "otherNoteSubreddits",
                    scope: SettingScope.Installation,
                    type: "paragraph",
                },
                {
                    fields: [
                        {
                            ...validatedSetting("enableNoteAllowList", "Enable Mod Note Allow List?"),
                            helpText: "If checked, ONLY the subreddits listed in the 'Allowed Mod Note Subreddits' field will be able to add mod notes to users in this subreddit.",
                            scope: SettingScope.Installation,
                            type: "boolean",
                        },
                        {
                            ...validatedSetting("noteAllowList", "Allowed Mod Note Subreddits"),
                            helpText: "One subreddit per line, case-insensitive. ONLY these subreddits can add mod notes to users in this subreddit. Ignored if 'Enable Mod Note Allow List?` is disabled. Leave blank to deny all other subreddits from adding mod notes in this subreddit.",
                            scope: SettingScope.Installation,
                            type: "paragraph",
                        },
                    ],
                    label: "Subreddit Mod Note Allow List",
                    type: "group",
                },
                {
                    ...validatedSetting("noteDenyList", "Denied Mod Note Subreddits"),
                    helpText: "One subreddit per line, case-insensitive. A list of subreddits that are not allowed to add mod notes to users in this subreddit. Ignored if 'Enable Mod Note Allow List?` is enabled.",
                    scope: SettingScope.Installation,
                    type: "paragraph",
                },
                {
                    defaultValue: ["ABUSE_WARNING"],
                    helpText: "Default Mod Note label.",
                    label: "Default Mod Note Label",
                    name: "defaultModNoteLabel",
                    options: [
                        {label: "Abuse Warning", value: "ABUSE_WARNING"},
                        {label: "Spam Warning", value: "SPAM_WARNING"},
                        {label: "Spam Watch", value: "SPAM_WATCH"},
                        {label: "Solid Contributor", value: "SOLID_CONTRIBUTOR"},
                        {label: "Helpful User", value: "HELPFUL_USER"},
                        {label: "Ban", value: "BAN"},
                        {label: "Bot Ban", value: "BOT_BAN"},
                        {label: "Perma Ban", value: "PERMA_BAN"},
                    ],
                    scope: SettingScope.Installation,
                    type: "select",
                },
            ],
            label: "Mod Note Settings",
            type: "group",
        },
    ],
);

Devvit.addTrigger({
    events: ["ModAction"],
    onEvent: onModActionEventHandler,
});

Devvit.addMenuItem({
    forUserType: "moderator",
    label: "BanHammer User",
    location: ["comment", "post"],
    onPress: onPressHandler,
});

const banForm = Devvit.createForm(
    generateActionForm,
    banFormOnSubmitHandler,
);

async function onPressHandler(event: MenuItemOnPressEvent, context: Context) {
    const {redis, settings, ui, userId} = context;
    await redis.set(`${userId}_context`, JSON.stringify(event));
    ui.showForm(
        banForm,
        {
            banUser: true,
            modNoteLabel: await settings.get("defaultModNoteLabel") || "ABUSE_WARNING",
            userMessage: await settings.get("defaultUserMessage") || "",
            banSubreddits: await settings.get("otherSubreddits") || "",
            noteSubreddits: await settings.get("otherNoteSubreddits") || "",
        },
    );
}

function replaceTokens(message: string, banItem: Comment | Post, remoteSubreddit: string): string {
    return message
        .replace("{{author}}", banItem.authorName)
        .replace("{{kind}}", banItem instanceof Comment ? "comment" : "post")
        .replace("{{originSubreddit}}", banItem.subredditName)
        .replace("{{subreddit}}", remoteSubreddit)
        .replace("{{url}}", getContextLink(banItem));
}

function generateActionForm(data: JSONObject): Form {
    return {
        fields: [
            {
                "type": "group",
                label: "Ban",
                "fields": [
                    {
                        defaultValue: data.banUser as boolean || false,
                        helpText: "Toggle to ban the user in the specified subreddit(s).",
                        label: "Ban User?",
                        name: "banUser",
                        type: "boolean",
                    },
                    {
                        defaultValue: data.duration as number || 0,
                        helpText: "Duration in days. 0 for permanent.",
                        label: "Duration",
                        name: "duration",
                        required: true,
                        type: "number",
                    },
                    {
                        defaultValue: data.reason as string || "",
                        helpText: "Additional details or reason for the ban. Will not be sent to the user.",
                        label: "Additional Info/Ban Mod Note",
                        name: "reason",
                        required: false,
                        type: "string",
                    },
                    {
                        defaultValue: data.userMessage as string || "",
                        helpText: "Message to send to user.",
                        label: "User Message",
                        name: "userMessage",
                        type: "paragraph",
                    },
                    {
                        defaultValue: data.banSubreddits as string || "",
                        helpText: "Additional subreddits to ban in. Leave blank to only ban in the current subreddit. One subreddit per line, case-insensitive.",
                        label: "Additional Ban Subreddits",
                        name: "banSubreddits",
                        type: "paragraph",
                    },
                ],
            },
            {
                type: "group",
                label: "Mod Note",
                fields: [
                    {
                        defaultValue: data.addNote as boolean || false,
                        helpText: "Toggle to add a mod note for the user in the specified subreddit(s).",
                        label: "Add Mod Note?",
                        name: "addNote",
                        type: "boolean",
                    },
                    {
                        defaultValue: data.modNoteLabel as string[],
                        label: "Mod Note Label",
                        name: "modNoteLabel",
                        type: "select",
                        options: [
                            {label: "Abuse Warning", value: "ABUSE_WARNING"},
                            {label: "Spam Warning", value: "SPAM_WARNING"},
                            {label: "Spam Watch", value: "SPAM_WATCH"},
                            {label: "Solid Contributor", value: "SOLID_CONTRIBUTOR"},
                            {label: "Helpful User", value: "HELPFUL_USER"},
                            {label: "Ban", value: "BAN"},
                            {label: "Bot Ban", value: "BOT_BAN"},
                            {label: "Perma Ban", value: "PERMA_BAN"},
                        ],
                    },
                    {
                        defaultValue: data.note as string || "",
                        label: "Mod Note",
                        name: "note",
                        type: "paragraph",
                    },
                    {
                        defaultValue: data.noteSubreddits as string || "",
                        helpText: "Additional subreddits to add a mod note in. Leave blank to only add a mod note in the current subreddit. Ignored if 'Add Mod Note?' is disabled. One subreddit per line, case-insensitive.",
                        label: "Additional Mod Note Subreddits",
                        name: "noteSubreddits",
                        type: "paragraph",
                    },
                ],
            },
        ],
        title: "BanHammer User",
    };
}

function validatedSetting(field: BanHammerSettingsKeys, display_name: string): {
    label: string,
    name: BanHammerSettingsKeys;
    onValidate: (event: SettingsFormFieldValidatorEvent<string | boolean>, context: Context) => Promise<void>
} {
    let validator = async (
        event: SettingsFormFieldValidatorEvent<string | boolean>,
        context: Context,
    ) => {
        const {modLog, reddit, redis, subredditName, settings} = context;
        const subreddit = subredditName ? subredditName : (
            await reddit.getCurrentSubreddit()
        ).name;
        const useGlobalRedis: boolean = await settings.get("enableGlobalRedis") === "true";
        let currentSetting: string | boolean | string[];
        const currentSettings = await loadSubredditSettings(context, subreddit);
        if (useGlobalRedis) {
            console.log(`display_name: ${display_name} useGlobalRedis: ${useGlobalRedis} ${typeof useGlobalRedis}`);
            currentSetting = JSON.parse(await redis.global.hGet(subreddit, field) || "\"Not Set\"");
        } else {
            currentSetting = currentSettings[field] || "Not Set";
        }
        const changeStrings: string[] = [];
        console.log(`${field}: ${JSON.stringify(event, null, 2)}`);
        if (typeof event.value === "boolean") {
            if (currentSetting === event.value) {
                return;
            }
            changeStrings.push(`${currentSetting ? "enabled" : "disabled"} -> ${event.value ? "enabled" : "disabled"}`);
        } else {
            const currentSet: Set<string> = new Set<string>(currentSetting === "Not Set"
                ? []
                : currentSetting as string[]);
            const newSet: Set<string> = new Set<string>((
                parseFormField(event.value as (boolean | string | undefined)) as string[]
            ));
            const added = [...newSet].filter((value) => !currentSet.has(value));
            const removed = [...currentSet].filter((value) => !newSet.has(value));
            if (currentSet.size === newSet.size && [...currentSet].every((value) => newSet.has(value))) {
                return;
            }
            if (added.length > 0) {
                changeStrings.push(`Added: ${humanList(added)}`);
            }
            if (removed.length > 0) {
                changeStrings.push(`Removed: ${humanList(removed)}`);
            }
        }
        // @ts-ignore
        currentSettings[field] = parseFormField(event.value as (boolean | string | undefined));
        await writeConfig(
            context,
            subreddit,
            {
                [field]: parseFormField(event.value as (boolean | string | undefined)),
            },
            useGlobalRedis,
        );
        if (await settings.get("enableModLogEntry") === "true") {
            await modLog.add({
                action: "dev_platform_app_changed",
                details: `Updated BanHammer setting "${display_name}": ${changeStrings.join(" and ")}`,
            });
        }
        console.log(`Updated Setting "${display_name}": ${changeStrings.join(" and ")}`);
    };
    return {label: display_name, name: field, onValidate: validator};
}

async function checkModPermissions(
    {action, context, otherSubreddit}: OtherSubredditCheckParams,
): Promise<boolean> {
    let actionName = action === BanHammerAction.Ban ? "ban" : "add mod note for";
    console.log(`Checking mod permissions to ${actionName} for r/${otherSubreddit}`);
    const triggeringSubreddit = (
        await context.reddit.getCurrentSubreddit()
    ).name;
    const triggeringMod: User | undefined = await context.reddit.getCurrentUser();
    const moderators: User[] = await context.reddit.getModerators({
        subredditName: otherSubreddit,
        username: triggeringMod?.username,
    }).all();
    let allowed = true;
    if (moderators.length < 1) {
        allowed = false;
    }
    let permissions = await moderators[0].getModPermissionsForSubreddit(otherSubreddit);
    if (allowed && !(
        permissions.includes("all") ||
        permissions.includes("access")
    )) {
        allowed = false;
    }
    if (!allowed) {
        context.ui.showToast({
            appearance: "neutral",
            text: `You do not have permission to ${actionName} users${otherSubreddit !== triggeringSubreddit
                ? ` in r/${(
                    otherSubreddit
                )}`
                : ""}!`,
        });
    }
    return allowed;
}

async function canActionInSubreddit(
    {action, context, otherSubreddit}: OtherSubredditCheckParams,
): Promise<boolean> {
    let actionName = action === BanHammerAction.Ban ? "ban" : "add mod note";
    console.log(`Checking if app can ${actionName} in r/${otherSubreddit}`);
    const {reddit, subredditName} = context;
    let appUser = await reddit.getAppUser();
    let moderators = await reddit.getModerators({subredditName: otherSubreddit, username: appUser.username}).all();
    if (moderators.length === 0)
        return false;
    let permissions = await moderators[0].getModPermissionsForSubreddit(otherSubreddit);
    if (!(
        permissions.includes("all") || permissions.includes("access")
    ))
        return false;
    const currentSubredditName = (
        subredditName || ""
    );
    const {
        subredditAllowList,
        subredditDenyList,
        enableAllowlist,
        enableNoteAllowList,
        noteAllowList,
        noteDenyList,
    } = await loadSubredditSettings(context, otherSubreddit);
    let allowed = false;
    if (action === BanHammerAction.Ban) {
        console.log(`Checking if app can ${actionName} in r/${otherSubreddit} from r/${currentSubredditName} with allow list ${subredditAllowList
        || "[]"} and deny list ${subredditDenyList || "[]"}`);
        allowed = enableAllowlist
            ? new Set(subredditAllowList).has(currentSubredditName.toLowerCase())
            : !new Set(subredditDenyList).has(currentSubredditName.toLowerCase());
    } else if (action === BanHammerAction.ModNote) {
        console.log(`Checking if app can ${actionName} in r/${otherSubreddit} from r/${currentSubredditName} with allow list ${noteAllowList
        || "[]"} and deny list ${noteDenyList || "[]"}`);
        allowed = enableNoteAllowList
            ? new Set(noteAllowList).has(currentSubredditName.toLowerCase())
            : !new Set(noteDenyList).has(currentSubredditName.toLowerCase());
    }
    return allowed;
}

function humanList(items: string[]): string {
    if (items.length === 0) {
        return "";
    }
    if (items.length === 1) {
        return items[0];
    }
    let workingItems = items.slice();
    const last = workingItems.pop();
    return workingItems.filter((value) => value.length > 0).join(", ") + (
        workingItems.length > 1 ? ", and " : " and "
    ) + last;
}

function getContextLink(target: Comment | Post) {
    if (target instanceof Post) {
        return `https://redd.it/${target.id.split("_")[1]}`;
    }
    return `https://www.reddit.com/r/${target.subredditName}/comments/${target.parentId.split("_")[1]}/_/${target.id.split(
        "_")[1]}`;
}

async function resolveSubreddit(context: Context, subredditName: string): Promise<string> {
    const {reddit, ui} = context;
    try {
        return (
            await reddit.getSubredditInfoByName(subredditName)
        ).name as string;
    } catch (e) {
        ui.showToast({
            appearance: "neutral",
            text: `Error fetching r/${subredditName}. It could be banned, private, or non-existent.`,
        });
    }
    return "";
}

async function banInSubreddit(
    context: Context,
    subreddit: string,
    triggeringSubreddit: string,
    item: Comment | Post,
    triggeringMod: User | undefined,
    targetId: string,
    duration: number,
    userMessage: string,
    reason: string,
    targetUser: User | undefined,
): Promise<number> {
    const {reddit, ui} = context;
    if (await checkModPermissions({action: BanHammerAction.Ban, context, otherSubreddit: subreddit})) {
        if (subreddit === triggeringSubreddit || await canActionInSubreddit({
            action: BanHammerAction.Ban,
            context,
            otherSubreddit: subreddit,
        })) {
            try {
                await reddit.banUser({
                    context: targetId,
                    duration: duration > 0 ? duration : undefined,
                    message: replaceTokens(userMessage, item, subreddit),
                    note: reason,
                    reason: `Mass ban by u/${triggeringMod?.username} from r/${triggeringSubreddit} utilizing the BanHammerApp.`,
                    subredditName: subreddit,
                    username: targetUser?.username || "",
                });
                console.log(`Banned from r/${subreddit}`);
                return 1;
            } catch (e) {
                console.error(`Error banning from r/${subreddit}: ${e}`);
                ui.showToast({
                    appearance: "neutral",
                    text: `Error while banning from r/${subreddit}`,
                });
            }
        }
    }
    return 0;
}

async function addModNote(
    otherSubreddit: string,
    triggeringSubreddit: string,
    context: Context,
    event: FormOnSubmitEvent<JSONObject>,
    label: string,
    item: Comment | Post,
    targetUser: User | undefined,
): Promise<number> {
    const {reddit, ui} = context;
    if (await checkModPermissions({action: BanHammerAction.ModNote, context, otherSubreddit})) {
        const inRemoteSubreddit = otherSubreddit === triggeringSubreddit;
        if (inRemoteSubreddit || await canActionInSubreddit({
            action: BanHammerAction.ModNote,
            context,
            otherSubreddit,
        })) {
            try {
                console.log(`note: ${event.values.note}`);
                await reddit.addModNote({
                    label: label as UserNoteLabel,
                    note: replaceTokens(event.values.note + (
                        inRemoteSubreddit
                            ? ""
                            : "\nSubmitted Content: {{url}}"
                    ), item, otherSubreddit),
                    subreddit: otherSubreddit,
                    user: targetUser?.username as string,
                    redditId: inRemoteSubreddit ? item.id : undefined,
                });
                console.log(`Added mod note in r/${otherSubreddit}`);
                return 1;
            } catch (e) {
                console.error(`Error adding mod note in r/${triggeringSubreddit}: ${e}`);
                ui.showToast({
                    appearance: "neutral",
                    text: `Error adding mod note in r/${triggeringSubreddit}`,
                });
            }
        }
    }
    return 0;
}

async function banFormOnSubmitHandler(event: FormOnSubmitEvent<JSONObject>, context: Context) {
    const {reddit, redis, ui, userId} = context;
    const label = (
        event.values.modNoteLabel as string[]
    )[0];
    if (!event.values.banUser && !event.values.addNote) {
        ui.showToast({
            appearance: "neutral",
            text: "Nothing to do!",
        });
        return;
    }
    if (event.values.addNote && !event.values.note) {
        ui.showToast({
            appearance: "neutral",
            text: "'Mod Note' is required if 'Add Mod Note?' is enabled!",
        });
        ui.showForm(
            banForm,
            {
                addNote: event.values.addNote,
                banSubreddits: event.values.banSubreddits,
                banUser: event.values.banUser,
                duration: event.values.duration,
                modNoteLabel: event.values.modNoteLabel,
                note: event.values.note,
                noteSubreddits: event.values.noteSubreddits,
                reason: event.values.reason,
                userMessage: event.values.userMessage,
            },
        );
        return;
    }

    let triggeringSubreddit = (
        await reddit.getCurrentSubreddit()
    ).name;
    let triggeringMod: User | undefined = await reddit.getCurrentUser();
    const {targetId, location} = JSON.parse(await redis.get(`${userId}_context`) || "{}");

    let item: Comment | Post = location === "comment"
        ? await reddit.getCommentById(targetId)
        : await reddit.getPostById(targetId);
    const targetUser: User | undefined = await reddit.getUserById(item.authorId || "");
    let subredditsToBan: string[] = (
        parseFormField(triggeringSubreddit + (
            event.values.banSubreddits || false ? `\n${(
                event.values.banSubreddits
            )}` : ""
        )) as string[]
    );
    let subredditsToModNote: string[] = (
        parseFormField(triggeringSubreddit + (
            event.values.noteSubreddits || false ? `\n${(
                event.values.noteSubreddits
            )}` : ""
        )) as string[]
    );
    const resolvedSubreddits: Map<string, string> = new Map<string, string>(await Promise.all(
        Array.from(new Set<string>(subredditsToBan.concat(subredditsToModNote)))
            .map(async (value) => (
                [value, await resolveSubreddit(context, value)] as [string, string]
            )),
    ));
    let subsNotedIn: number = 0;
    let subsBannedFrom: number = 0;
    if (event.values.banUser) {
        subsBannedFrom = (
            await Promise.all(
                subredditsToBan.map((value) => resolvedSubreddits.get(value) || "")
                    .filter((value) => value !== "")
                    .map((otherSubreddit) => banInSubreddit(
                        context,
                        otherSubreddit,
                        triggeringSubreddit,
                        item,
                        triggeringMod,
                        targetId,
                        event.values.duration as number,
                        event.values.userMessage as string,
                        event.values.reason as string,
                        targetUser,
                    )))
        )
            .filter((banned) => banned > 0)
            .reduce((a, b) => a + b, 0);
    }
    if (event.values.addNote) {
        subsNotedIn = (
            await Promise.all(
                subredditsToModNote.map((value) => resolvedSubreddits.get(value) || "")
                    .filter((value) => value !== "")
                    .map((otherSubreddit) => addModNote(
                        otherSubreddit,
                        triggeringSubreddit,
                        context,
                        event,
                        label,
                        item,
                        targetUser,
                    )))
        )
            .filter((noted) => noted > 0)
            .reduce((a, b) => a + b, 0);
    }
    if (event.values.banUser)
        ui.showToast({
            appearance: "success",
            text: `Banned from ${subsBannedFrom} subreddit${subsBannedFrom === 1 ? "" : "s"}`,
        });
    if (event.values.addNote)
        ui.showToast({
            appearance: "success",
            text: `Added mod note in ${subsNotedIn} subreddit${subsNotedIn === 1 ? "" : "s"}`,
        });
}

async function onModActionEventHandler(
    event: ModAction,
    context: TriggerContext,
) {
    const {reddit, redis, settings, subredditName} = context;
    if ((
        await redis.get("wikiUpdateRequired")
    ) === "false") {
        return;
    }
    console.log("Updating wiki page");
    // @ts-ignore
    const {action, moderator} = event as ModAction;
    if ((
        action !== "wikirevise" && action !== "dev_platform_app_changed"
    ) || moderator?.name !== (
        await reddit.getAppUser()
    ).username) {
        return;
    }
    const subreddit = subredditName ? subredditName : (
        await reddit.getCurrentSubreddit()
    ).name;
    await redis.set("wikiUpdateRequired", "false");
    await writeConfigToWikiPage(
        reddit,
        {
            subredditAllowList: parseFormField(await settings.get("subredditAllowList")) as string[],
            subredditDenyList: parseFormField(await settings.get("subredditDenyList")) as string[],
            enableAllowlist: await settings.get("enableAllowlist") || false,
            enableNoteAllowList: await settings.get("enableNoteAllowList") || false,
            noteAllowList: parseFormField(await settings.get("noteAllowList")) as string[],
            noteDenyList: parseFormField(await settings.get("noteDenyList")) as string[],
        },
        subreddit,
    );
}

// noinspection JSUnusedGlobalSymbols
export default Devvit;

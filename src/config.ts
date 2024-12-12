import {Context, RedditAPIClient, WikiPage} from "@devvit/public-api";

const WIKI_PAGE: string = "app_config/banhammerapp";

export type BanHammerSettings = {
    subredditAllowList: string[];
    subredditDenyList: string[];
    enableAllowlist: boolean;
    enableNoteAllowList: boolean;
    noteAllowList: string[];
    noteDenyList: string[];
}
export type BanHammerSettingsKeys = keyof BanHammerSettings;

export async function loadSubredditSettings(context: Context, subreddit: string): Promise<BanHammerSettings> {
    console.log(`Loading settings for r/${subreddit}`);
    const {reddit, settings: appSettings} = context;
    if (
        await appSettings.get("enableGlobalRedis") === "false"
    ) {
        const wikiPage = await ensureWikiPage(reddit, subreddit);
        return JSON.parse(filterWikiPageComment(wikiPage.content));
    }
    const data: Record<string, string> = await context.redis.global.hGetAll(subreddit) || {};
    const settings: BanHammerSettings = {
        subredditAllowList: [],
        subredditDenyList: [],
        enableAllowlist: false,
        enableNoteAllowList: false,
        noteAllowList: [],
        noteDenyList: [],
    };
    Object.entries(data).forEach(([key, value]) => {
        if (!(
            key in settings
        )) {
            console.error(`Invalid key ${key} in Redis data`);
            return;
        }
        try {
            settings[key as BanHammerSettingsKeys] = JSON.parse(value);
        } catch (error) {
            console.error(`Failed to parse value for key ${key}:`, error);
        }
    });
    return settings;
}

export function parseFormField(value: boolean | string | undefined): boolean | string[] {
    if (typeof value === "boolean") {
        return value;
    }
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

export async function writeConfig(
    context: Context,
    subreddit: string,
    settings: Partial<BanHammerSettings>,
    useGlobalRedis: boolean,
) {
    const {reddit, redis} = context;
    const data: { [p: string]: string } = {};
    for (let k in settings) {
        // @ts-ignore
        data[k] = JSON.stringify(settings[k]);
    }
    if (useGlobalRedis) {
        await redis.global.hSet(subreddit, data);
        console.log(`Settings for r/${subreddit} updated: ${JSON.stringify(settings)}`);
    } else {
        await redis.set("wikiUpdateRequired", "true");
        const wikiPage = await ensureWikiPage(reddit, subreddit);
        await wikiPage.update(
            `# BanHammer Configuration
# This page is used to store the configuration for the BanHammer app.
# Do not edit this page manually, edit the settings for BanHammer [here](https://developers.reddit.com/r/${(
                subreddit
            )}/apps/banhammerapp) instead.`,
            `Updated settings for BanHammer`,
        );
    }
}

async function ensureWikiPage(reddit: RedditAPIClient, subreddit: string): Promise<WikiPage> {
    try {
        return await reddit.getWikiPage(subreddit, WIKI_PAGE);
    } catch (e) {
        return await reddit.createWikiPage({
            subredditName: subreddit,
            page: WIKI_PAGE,
            content: '{"banAllowlist":[],"banDenylist":[],"enableBanAllowlist":false,"noteAllowlist":[],"noteDenylist":[],"enableNoteAllowlist":false,"lastUpdated":""}',
        });
    }
}

function filterWikiPageComment(content: string) {
    return content.split("\n").filter((line) => !line.startsWith("#")).join("\n");
}

export async function writeConfigToWikiPage(reddit: RedditAPIClient, settings: BanHammerSettings, subreddit: string) {
    const wikiPage = await ensureWikiPage(reddit, subreddit);
    await wikiPage.update(
        `# BanHammer Configuration
# This page is used to store the configuration for the BanHammer app.
# Do not edit this page manually, edit the settings for BanHammer [here](https://developers.reddit.com/r/${(
            subreddit
        )}/apps/banhammerapp) instead.\n${(
            JSON.stringify(settings)
        )}`,
        `Updated settings for BanHammer`,
    );
    console.log(`Wiki page written`);
}


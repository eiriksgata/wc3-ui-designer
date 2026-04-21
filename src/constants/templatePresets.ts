/**
 * 与 wc3-map-ts-template 模板侧常量对齐的预设表。
 *
 * 源文件：
 * - `wc3-map-ts-template/src/constants/ui/preset.ts`
 * - `wc3-map-ts-template/src/system/ui/component/Button.ts` (ButtonTemplates)
 * - `wc3-map-ts-template/src/system/ui/component/Text.ts` (TextColors/FontSizes/TextFonts)
 *
 * 这里仅供设计器 UI 的下拉使用；实际运行态值以模板仓为准。
 */

/**
 * 常用背景纹理预设（Frame Backdrop 用）。
 */
export const UIBackgrounds = {
    NONE: '',
    BLACK_TRANSPARENT: 'UI\\Widgets\\EscMenu\\Human\\editbox-background.blp',
    DIALOG: 'UI\\Widgets\\Glues\\GlueScreen-DialogBackground.blp',
    QUEST: 'UI\\Widgets\\Quests\\QuestMainBackdrop.blp',
    ESC_MENU: 'UI\\Widgets\\EscMenu\\Human\\human-options-menu-background.blp',
    TOOLTIP: 'UI\\Widgets\\ToolTips\\Human\\human-tooltip-background.blp',
    HUMAN_BORDER: 'UI\\Widgets\\print\\Human\\CommandButton\\human-multipleselection-border.blp',
    // 水墨风格套件
    SHUIMO_PANEL: 'Texture\\ui\\panel_background.tga',
    SHUIMO_PANEL_TITLE: 'Texture\\ui\\panel_title_background.tga',
    SHUIMO_CLOSE_BTN: 'Texture\\ui\\button_close_background.tga',
} as const;

export type UIBackgroundKey = keyof typeof UIBackgrounds;

/**
 * FDF 按钮模板预设（对应 Button.createWithTemplate 的 inherits 参数）。
 */
export const ButtonTemplates = {
    NORMAL_UP: 'normal_button_up',
    NORMAL_DOWN: 'normal_button_down',
    NORMAL_DIALOG: 'normal_dialog',
    TOOLTIP: 'tooltips',
    TOOLTIP2: 'tooltips2',
    BUTTON1: 'button1',
} as const;

export type ButtonTemplateKey = keyof typeof ButtonTemplates;

/**
 * 常用文字颜色（十六进制 RGB，无 # 前缀）。
 */
export const TextColors = {
    WHITE: 'FFFFFF',
    BLACK: '000000',
    RED: 'FF0000',
    GREEN: '00FF00',
    BLUE: '0000FF',
    YELLOW: 'FFFF00',
    ORANGE: 'FFA500',
    PURPLE: '800080',
    CYAN: '00FFFF',
    PINK: 'FFC0CB',
    GOLD: 'FFD700',
    SILVER: 'C0C0C0',
    GRAY: '808080',
} as const;

export type TextColorKey = keyof typeof TextColors;

/**
 * 字体大小预设（像素）。模板侧 setFontSizePixels 会换算到 WC3 归一化坐标。
 */
export const FontSizePx = {
    TINY: 8,
    SMALL: 10,
    MEDIUM: 12,
    LARGE: 14,
    XLARGE: 16,
    TITLE: 20,
    HUGE: 24,
} as const;

export type FontSizeKey = keyof typeof FontSizePx;

/**
 * 常用字体路径预设。
 */
export const TextFonts = {
    DEFAULT: '',
    CUSTOM: 'UI\\hpbar\\ZiTi.ttf',
    MASTER: 'Fonts\\FZXH1JW.TTF',
} as const;

export type TextFontKey = keyof typeof TextFonts;

/**
 * 从值反查 key（便于在 UI 显示"预设名 + 路径"）。
 */
export function lookupUIBackgroundKey(value: string): UIBackgroundKey | undefined {
    for (const k of Object.keys(UIBackgrounds) as UIBackgroundKey[]) {
        if (UIBackgrounds[k] === value) return k;
    }
    return undefined;
}

export function lookupButtonTemplateKey(value: string): ButtonTemplateKey | undefined {
    for (const k of Object.keys(ButtonTemplates) as ButtonTemplateKey[]) {
        if (ButtonTemplates[k] === value) return k;
    }
    return undefined;
}

export function lookupTextColorKey(value: string): TextColorKey | undefined {
    const upper = (value || '').toUpperCase();
    for (const k of Object.keys(TextColors) as TextColorKey[]) {
        if (TextColors[k] === upper) return k;
    }
    return undefined;
}

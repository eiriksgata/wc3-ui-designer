local outline = {
    color = "|cff000000",
    width = 2
}
local font_size = 0.02
local text = '|cffff0000你好|cff00ff00世界|r'
Frame.Panel.new {
    x = 300,
    y = 300,
    w = 100,
    h = 100,
    {
        name = 'left',
        type = 'Text',
        text = string.format('%s%s|r', outline.color, string.clear_color(text)),
        font_size = font_size,
        x = -outline.width,
        y = 0,
    },
    {
        name = 'top',
        type = 'Text',
        text = string.format('%s%s|r', outline.color, string.clear_color(text)),
        font_size = font_size,
        x = 0,
        y = -outline.width,
    },
    {
        name = 'right',
        type = 'Text',
        text = string.format('%s%s|r', outline.color, string.clear_color(text)),
        font_size = font_size,
        x = outline.width,
        y = 0,
    },
    {
        name = 'bottom',
        type = 'Text',
        text = string.format('%s%s|r', outline.color, string.clear_color(text)),
        font_size = font_size,
        x = 0,
        y = outline.width,
    },
    {
        name = 'real',
        type = 'Text',
        text = text,
        font_size = font_size,
        x = 0,
        y = 0,
    }
}

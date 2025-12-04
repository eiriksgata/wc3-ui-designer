---@class Frame.Text:Frame
---@field new fun(params:TextField):Frame.Text
Frame.Text = Class('Frame.Text', Frame)

Frame.Text.font_size = 0.01
Frame.Text.font_path = [[DENG.ttf]]
Frame.Text.stroke = 0
---@enum(key) Text.text_align
Frame.Text.text_align = {
    -- 左上
    top_left = 3,
    -- 顶部
    top = 16,
    -- 右上
    top_right = 32,
    -- 左侧
    left = 2,
    -- 中心
    center = 18,
    -- 右侧
    right = 34,
    -- 左下
    bottom_left = 4,
    -- 底部
    bottom = 20,
    -- 右下
    bottom_right = 36,
}


---@param params TextField
function Frame.Text:ctor(params)
    local parent = params.parent or Frame.GameUI
    local handle = japi.DzCreateFrameByTagName('TEXT', '@TEXT@', parent.handle, params.template, 0)
    Frame.ctor(self, handle, params)
    self:SetAlign(params.align or "top_left")
    self:SetFontSize(params.font_size or Frame.Text.font_size)
    self:SetFontPath(params.font_path or Frame.Text.font_path)
    self:SetText(params.text or "")
    self:SetEnable(false)
    if params.outline then
        self:SetOutLine(params.outline)
    end
    if params.color then
        self:SetGColor(params.color)
    end
end

function Frame.Text:SetText(text)
    lapi.FrameSetText(self.handle, tostring(text) or "")
end

function Frame.Text:SetFontPath(font)
    self.font_path = font
    xmapi.XMFrameSetFont(self.handle, self.font_path, self.font_size, self.stroke)
end

function Frame.Text:SetFontSize(size)
    self.font_size = size
    xmapi.XMFrameSetFont(self.handle, self.font_path, self.font_size, self.stroke)
end

function Frame.Text:SetStroke(stroke)
    self.stroke = stroke
    xmapi.XMFrameSetFont(self.handle, self.font_path, self.font_size, self.stroke)
end

function Frame.Text:GetSize()
    local size = lapi.FrameGetSize(self.handle)
    return Frame.War3(size.width, size.height)
end

function Frame.Text:SetAlign(align)
    japi.XMFrameSetTextAlignment(self.handle, self.text_align[align] or 0)
end

---@param spacing number
function Frame.Text:SetCharSpacing(spacing)
    xmapi.XMTextSetCharSpacing(self.handle, spacing)
end

---@class TextOutLineField
---@field width ?number
---@field r     ?number
---@field g     ?number
---@field b     ?number
---@field a     ?number

function Frame.Text:SetOutLine(params)
    xmapi.XMFrameSetOutline(
        self.handle,
        params.width or 0,
        params.r or 255,
        params.g or 255,
        params.b or 255,
        params.a or 255
    )
    -- xmapi.XMTextSetCharSpacing(self.handle, 0.08)
    xmapi.XMFrameSetGColor(self.handle, 0, 0, 0, 0)
end

---@class TextGColorField
---@field lt number
---@field lb number
---@field rt number
---@field rb number
---@field x  number
---@field y  number

function Frame.Text:SetGColor(params)
    xmapi.XMFrameSetGColor(
        self.handle,
        params.lt,
        params.lb,
        params.rt,
        params.rb
    )
    xmapi.XMFrameSetGColorOffset(self.handle, params.x, params.y)
end

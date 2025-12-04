---背景
---@class HighLight:Frame
---@field new fun(params:HighlightField):HighLight 创建新实例
Frame.HighLight = Class("HighLight", Frame)

---@enum Frame.HighLight.Type
Frame.HighLight.Type = {
    OUTLINE = 1,     -- 轮廓高亮：用轮廓线的方式高亮对象。
    SHADE = 2,       -- 阴影高亮：通过阴影来突出对象。
    FILETEXTURE = 3, -- 纹理贴图高亮：使用自定义纹理贴图进行高亮。
}
---@enum Frame.HighLight.Mode
Frame.HighLight.Mode = {
    DISABLE = 0,    -- 禁用：不启用任何高亮效果。
    ALPHAKEY = 1,   -- Alpha 键值混合：一种透明度处理方式，常用于裁剪特定颜色。
    BLEND = 2,      -- 混合模式：将高亮效果与背景混合，使过渡更自然。
    ADD = 3,        -- 加法混合：将高亮效果叠加到背景上，产生发光感。
    MODULATE = 4,   -- 调制混合：根据背景颜色调整高亮效果，常用于动态光照。
    MODULATE2X = 5, -- 双倍调制混合：类似 MODULATE，但效果更强，亮度加倍。
}

---构造函数
---@param params HighlightField
function Frame.HighLight:ctor(params)
    local parent = params.parent or Frame.GameUI
    local handle = lapi.CreateFrameByTagName("HIGHLIGHT", "@HIGHLIGHT@", parent.handle, "", 1)
    Frame.ctor(self, handle, params)
    self:setTexture(params.image)
    if params.alpha_mode then
        self:setAlphaMode(params.alpha_mode)
    end
    if params.alpha_type then
        self:setAlphaType(params.alpha_type)
    end
end

---设置图片
---@param texture string 图片
function Frame.HighLight:setTexture(texture)
    xmapi.XMFrameSetAlphaFile(self.handle, texture)
end

---设置类型
---@param type Frame.HighLight.Type 1:OUTLINE 2:SHADE 3:FILETEXTURE
function Frame.HighLight:setAlphaType(type)
    xmapi.XMFrameSetAlphaType(self.handle, type)
end

---设置模式
---@param mode Frame.HighLight.Mode 0:DISABLE 1:ALPHAKEY 2:BLEND 3:ADD 4:MODULATE 5:MODULATE2X
function Frame.HighLight:setAlphaMode(mode)
    xmapi.XMFrameSetAlphaMode(self.handle, mode)
end

---设置颜色
---comment
---@param r integer
---@param g integer
---@param b integer
---@param a integer
function Frame.HighLight:setAlphaColor(r, g, b, a)
    xmapi.XMFrameSetAlphaColor(self.handle, Frame.GetColorInteger(r, g, b, a))
end

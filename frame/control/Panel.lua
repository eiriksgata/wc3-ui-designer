---@class Frame.Panel:Frame
---@field new fun(params:PanelField):Frame.Panel
Frame.Panel = Class('Panel', Frame)

---@param params PanelField
function Frame.Panel:ctor(params)
    local parent = params.parent or Frame.GameUI
    local handle = lapi.CreateFrameByTagName('BACKDROP', '@BACKDROP@', parent.handle, params.template or "", 0)
    Frame.ctor(self, handle, params)
    self:SetTexture(params.image or Const.Texture.blank)
    self:SetEnable(false)
    if params.border then
        self:SetBorder(params.border)
    end
end

function Frame.Panel:SetTexture(image)
    lapi.FrameSetTexture(self.handle, image, 0)
end

---@class PanelBorderField
---@field image     string
---@field border    string
---@field style     ?number  1不拉伸2小图填充
---@field size      ?number  边框大小
---@field bg_size   ?number  不知道干啥的
---@field left      ?number  边距离
---@field right     ?number  边距离
---@field top       ?number  边距离
---@field bottom    ?number  边距离

---@param params PanelBorderField
function Frame.Panel:SetBorder(params)
    local image   = params.image
    local border  = params.border
    local style   = params.style or 0
    local size    = params.size or 0.008
    local bg_size = params.bg_size or 0.04
    local left    = params.left or 0.003
    local right   = params.right or 0.003
    local top     = params.top or 0.003
    local bottom  = params.bottom or 0.003
    xmapi.XMBackdropSetTexture(self.handle, image, style, size, bg_size, border, left, right, top, bottom)
end

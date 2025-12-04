---@class Frame.Model:Frame.Sprite
---@field new fun(data:ModelField):Frame.Model
Frame.Model = Class("Frame.Model", Frame.Sprite)

local t     = lapi.CreateTimer()
lapi.AsynTimerStart(t, 0, true, function()
    japi.XMSetUIClearDepth(true)
    lapi.DestroyTimer(t)
end)

---@param params any
function Frame.Model:ctor(params)
    params.parent = params.parent or Frame.GameUI
    local handle  = xmapi.XMFrameCreatePortrait("", params.parent.handle)
    Frame.ctor(self, handle, params)
    -- self:SetModel([[Objects\InventoryItems\BundleofGifts\BundleofGifts.mdl]])
    self:SetModel(params.model)
    xmapi.XMFrameSetIgnoreTrackEvents(self.handle, true)
end

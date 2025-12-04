---@class Frame.Button :Frame.Panel
---@field new fun(params:ButtonField):Frame.Button
Frame.Button = Class('Frame.Button ', Frame.Panel)

---@param params ButtonField
function Frame.Button:ctor(params)
    Frame.Panel.ctor(self, params)
    self:SetEnable(true)
end

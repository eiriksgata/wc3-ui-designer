---@class Frame.Interface:Frame
---@field new fun():Frame.Interface
local _Interface = Class("Frame.Interface", Frame)
local instance = Frame:GetInstance()
function _Interface:ctor()
    self.handle = xmapi.XMGetHPUIInterface()
    self:Set('x', 0)
    self:Set('y', 0)
    self:Set('w', 1920)
    self:Set('h', 1080)
    self.name = "Interface"
    instance[self.handle] = self
end

xmapi.XMAdjustPreselectUILevel()
Frame.Interface = _Interface.new()

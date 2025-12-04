---@class Frame.Lowest:Frame
---@field new fun():Frame.Interface
local _Lowest = Class("Frame.Lowest", Frame)
local instance = Frame:GetInstance()
function _Lowest:ctor()
    self.handle = xmapi.XMFrameGetLowest()
    self:Set('x', 0)
    self:Set('y', 0)
    self:Set('w', 1920)
    self:Set('h', 1080)
    self.name = "Lowest"
    instance[self.handle] = self
end

Frame.Lowest = _Lowest.new()

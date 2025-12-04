---@class GameUI:Frame
---@field new fun():GameUI
local GameUI = Class("GameUI", Frame)
local instance = Frame:GetInstance()
function GameUI:ctor()
    self.handle = lapi.GetGameUI()
    self:Set('x', 0)
    self:Set('y', 0)
    self:Set('w', 1920)
    self:Set('h', 1080)
    self.name = "GameUI"
    instance[self.handle] = self
end

Frame.GameUI = GameUI.new()

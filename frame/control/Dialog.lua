---@class Frame.Dialog:Frame.Panel
---@field new fun(name:string,parent:Frame?):Frame.Dialog
Frame.Dialog = Class('Frame.Dialog', Frame.Panel)

function Frame.Dialog:ctor(name, parent)
    local w = 500
    local h = 300
    Frame.Panel.ctor(self, {
        parent   = parent,
        w        = w,
        h        = h,
        template = 'normal_dialog',
        image    = Const.Texture.disenable,
        {
            name      = 'title',
            text      = "|cffffd900" .. name .. "|r",
            type      = 'Text',
            align     = 'center',
            y         = 20,
            h         = 40,
            font_size = 0.02
        }
    })
    self._w       = w
    self._h       = h
    self.sync_key = base.id('选择难度对话框')
    self.name     = name
    self.index    = 1
    self.buttons  = {}
    self:SetVisible(false)
    cmd.Add(self.sync_key, function(player, id)
        local button = self.buttons[id]
        if button.on_sync then
            button.on_sync(player, id)
        end
    end)
end

function Frame.Dialog:Remove()
    cmd.Remove(self.sync_key)
    Frame.Panel.Remove(self)
end

---@class DialogButtonField
---@field text     string
---@field callback nil|fun(player:player,id:number)
---@field on_enter nil|fun(self:Frame.Button,player:player)
---@field on_click nil|fun(self:Frame.Button,player:player)
---@field on_sync  nil|fun(self:Frame.Button,player:player)


---@param data DialogButtonField
function Frame.Dialog:addButton(data)
    local i = self.index
    ---@class Frame.DialogButton:Frame.Button
    local button = Frame.Button.new {
        parent   = self,
        x        = self._w * 0.1,
        y        = 70 + (i - 1) * 65,
        w        = self._w * 0.8,
        h        = 50,
        image    = Const.Texture.disenable,
        template = [[normal_button_up]],
        on_enter = function(btn, player)
            if data.on_enter then
                ---@diagnostic disable-next-line: param-type-mismatch
                data.on_enter(btn, player)
            end
        end,
        on_click = function(btn, player)
            if data.on_click then
                ---@diagnostic disable-next-line: param-type-mismatch
                data.on_click(btn, player)
            end
            cmd.Send(self.sync_key, i)
        end,
        {
            name = 'text',
            text = data.text,
            type = 'Text',
            align = 'center',
            font_size = 0.015
        }
    }
    button.on_sync = data.on_sync
    self.buttons[i] = button
    self.index = self.index + 1
    return button
end

---@param player Player
---@param visible boolean
function Frame.Dialog:Show(player, visible, x, y, duration)
    if player:IsLocal() then
        local w, h = self:GetChildrenInitSize()
        self:SetSize(w, h + 50)
        self:SetCenter()
        self:playActionParams {
            visible = visible,
            x = x or 0,
            y = y or 0,
            duration = duration or 0,
        }
    end
end

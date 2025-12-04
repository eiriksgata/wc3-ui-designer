local function parse_child(frame, params)
    for index, value in ipairs(params) do
        local type = value.type
        local name = value.name
        local class = Frame[type]
        if type and name and class then
            local child          = params[index]
            child.parent         = frame
            frame[name]          = class.new(child)
            frame[name].__source = frame:GetSourcePath()
        end
    end
end

---@class Frame:Class
---@field __cname  string
---@field handle   framehandle
---@field Register fun(self:self,event:string,                 f:fun(trg:Trigger,self:self,player:Player,...))
---@field Register fun(self:self,event:"on_click",             f:fun(trg:Trigger,self:self,player:Player))
---@field Register fun(self:self,event:"on_mid_click",         f:fun(trg:Trigger,self:self,player:Player))
---@field Register fun(self:self,event:"on_right_click",       f:fun(trg:Trigger,self:self,player:Player))
---@field Register fun(self:self,event:"on_enter",             f:fun(trg:Trigger,self:self,player:Player))
---@field Register fun(self:self,event:"on_leave",             f:fun(trg:Trigger,self:self,player:Player))
---@field Register fun(self:self,event:"on_wheel",             f:fun(trg:Trigger,self:self,player:Player,delat:number))
---@field Register fun(self:self,event:"on_show",              f:fun(trg:Trigger,self:self,player:Player))
---@field Register fun(self:self,event:"on_hide",              f:fun(trg:Trigger,self:self,player:Player))
---@field Register fun(self:self,event:"on_move",              f:fun(trg:Trigger,self:self,player:Player))
---@field Register fun(self:self,event:"on_drag",              f:fun(trg:Trigger,self:self,player:Player))
---@field Register fun(self:self,event:"on_update",            f:fun(trg:Trigger,self:self,player:Player))
---@field Register fun(self:self,event:"on_cooldown_finish",   f:fun(trg:Trigger,self:self,player:Player))
---@field Register fun(self:self,event:"on_double_click",      f:fun(trg:Trigger,self:self,player:Player))
---@field Register fun(self:self,event:"on_change_alpha",      f:fun(trg:Trigger,self:self,player:Player))
---@field Register fun(self:self,event:"on_remove",            f:fun(trg:Trigger,self:self,player:Player))
Frame = Class('Frame')

local instance = {}

---@param handle framehandle
---@param params FrameField
function Frame:ctor(handle, params)
    instance[handle] = self
    self.handle      = handle
    self:Set('p1', params.anchor)
    self:Set('p2', params.parent_anchor)
    local w, h = params.w, params.h
    local parent = self:GetParent()
    local anchor_parent = params.anchor_parent
    self:SetSize(w, h)
    if parent then
        w = w or parent:GetWidth()
        h = h or parent:GetHeight()
        self:SetSize(w, h)
    end
    if anchor_parent then
        w = w or anchor_parent:GetWidth()
        h = h or anchor_parent:GetHeight()
        self.parent = anchor_parent.handle
        self:SetSize(w, h)
    end
    self:SetPosition(params.x, params.y)
    self:Init(params)
    self:Notify('on_init', parent)
    --- 记录初始位置和大小
    self:Set('_w', self:Get("w"))
    self:Set('_h', self:Get("h"))
    self:Set('_x', self:Get("x"))
    self:Set('_y', self:Get('y'))
end

function Frame:Remove()
    if self.removed then
        return
    end
    self:EnumChidrens(function(frame)
        frame:Remove()
    end)
    self.removed = true
    xmapi.XMDestroyFrame(self.handle)
end

lapi.FrameSetDestroyByCode('_destroy', function()
    local handle = xmapi.XMFrameGetTriggerUI()
    local class = Frame:Class(handle)
    if class then
        class:Notify('on_remove')
        class.removed = true
    end
    instance[handle] = nil
end)

function Frame:Set(key, value)
    if not value then
        return
    end
    xmapi.XMFrameSetAttrReal(self.handle, lapi.StringHash(key), value)
end

function Frame:Get(key)
    local v = xmapi.XMFrameGetAttrReal(self.handle, lapi.StringHash(key))
    return v or 0
end

function Frame:SetInt(key, value)
    if not value then
        return
    end
    xmapi.XMFrameSetAttrInteger(self.handle, lapi.StringHash(key), value)
end

function Frame:GetInt(key)
    local v = xmapi.XMFrameGetAttrInteger(self.handle, lapi.StringHash(key))
    return v or 0
end

function Frame:Init(params)
    if params.alpha ~= nil then
        self:SetAlpha(params.alpha)
    end
    if params.enable ~= nil then
        self:SetEnable(params.enable)
    end
    if params.visible ~= nil then
        self:SetVisible(params.visible)
    end
    if params.drag ~= nil then
        self:SetDrag(params.drag)
    end
    if params.view ~= nil then
        self:SetViewPort(params.view)
    end
    if params.highlight ~= nil then
        self:SetHighLight(params.highlight, params.alpha_type, params.alpha_mode)
    end

    for key, value in pairs(params) do
        if type(value) == "function" then
            self:Register(key, value)
        end
    end

    self:Register('on_wheel', function(_, _, _, delta)
        local parent = self:GetParent()
        if parent then
            parent:Notify('on_wheel', delta)
        end
    end)
    --- 解析子UI
    parse_child(self, params)
end

function Frame:Class(frame)
    return instance[frame]
end

function Frame:GetInstance()
    return instance
end

function Frame:GetHandle()
    return self.handle
end

function Frame:SetParent(parent)
    xmapi.XMFrameSetParent(self.handle, parent.handle)
end

---@return Frame
function Frame:GetParent()
    local parent = lapi.FrameGetParent(self.handle)
    return Frame:Class(parent)
end

---@param x number?
---@param y number?
function Frame:SetPosition(x, y)
    x = x or 0
    y = y or 0
    self:Set('x', x)
    self:Set('y', y)
    x, y = Frame.Pixel(x, y)
    local p1 = math.floor(self:Get('p1'))
    local p2 = math.floor(self:Get("p2"))
    local parent = Frame:Class(self.parent) or self:GetParent() or Frame.GameUI
    lapi.FrameSetPoint(self.handle, p1, parent.handle, p2, x, -y)
end

function Frame:SetPoint(anchor, parent, parent_anchor, x, y)
    self.parent = parent:GetHandle()
    self:Set('p1', anchor)
    self:Set('p2', parent_anchor)
    self:SetPosition(x, y)
end

function Frame:GetPosition()
    return self:Get('x'), self:Get('y')
end

function Frame:GetRealPosition(anchor)
    anchor     = anchor or 0
    local x, y = xmapi.XMFrameGetX2(self.handle), xmapi.XMFrameGetY2(self.handle)
    x, y       = Frame.War3(x, y)
    y          = 1080 - y
    local w, h = self:GetSize()
    if anchor == 0 then
        y = y - h
    end
    if anchor == 1 then
        x = x + w / 2
        y = y - h
    end
    if anchor == 2 then
        x = x + w
        y = y - h
    end
    if anchor == 3 then
        y = y - h / 2
    end
    if anchor == 4 then
        x = x + w / 2
        y = y - h / 2
    end
    if anchor == 5 then
        x = x + w
        y = y - h / 2
    end
    if anchor == 6 then
        x = x
        y = y
    end
    if anchor == 7 then
        x = x + w / 2
    end
    if anchor == 8 then
        x = x + w
    end
    return x, y
end

function Frame:SetViewPort(view)
    xmapi.XMFrameSetScroll(self.handle, true)
end

function Frame:SetAbsolutePosition(anchor, x, y)
    x = Frame.PixelX(x)
    y = Frame.PixelY(y)
    xmapi.XMFrameSetAbsolutePoint(self.handle, anchor, x, y)
end

function Frame:GetAcnhorPosition(anchor)
    anchor = anchor or self:Get('p1')
    return xmapi.XMFrameGetPoint(self.handle, anchor)
end

function Frame:SetHeight(h)
    self:SetSize(self:GetWidth(), h)
end

function Frame:SetWidth(w)
    self:SetSize(w, self:GetHeight())
end

function Frame:SetSize(w, h)
    w = w or 0
    h = h or 0
    self:Set("w", w)
    self:Set('h', h)
    xmapi.XMFrameSetSize(self.handle, Frame.Pixel(w, h))
end

function Frame:GetWidth()
    return self:Get 'w'
end

function Frame:GetHeight()
    return self:Get "h"
end

function Frame:GetSize()
    return self:Get 'w', self:Get "h"
end

function Frame:GetRealSize()
    local size = lapi.FrameGetSize2(self.handle)
    return Frame.War3W(size.width), Frame.War3H(size.height)
end

function Frame:SetVisible(enable)
    xmapi.XMFrameShow(self.handle, enable)
end

function Frame:IsVisible()
    return xmapi.XMFrameIsVisible(self.handle)
end

---@param Adjust xmapi.ADJUST_PRIORITY
function Frame:SetAdjustPriority(Adjust)
    xmapi.XMFrameAdjustPriority(self.handle, Adjust)
end

function Frame:SetEnable(enable)
    xmapi.XMFrameSetEnable(self.handle, enable)
end

function Frame:IsEnable()
    return xmapi.XMFrameGetEnable(self.handle)
end

function Frame:SetAlpha(alpha)
    alpha = math.clamp(alpha, 0, 255)
    xmapi.XMFrameSetAlpha(self.handle, alpha)
    self:Notify('on_change_alpha')
end

function Frame:GetAlpha()
    return xmapi.XMFrameGetAlpha(self.handle)
end

function Frame:SetScale(scale)
    xmapi.XMFrameSetScale(self.handle, scale)
end

function Frame:GetScale()
    return xmapi.XMFrameGetScale(self.handle)
end

---@param ui Frame
function Frame:SetAllPoints(ui)
    self:ClearAllPoints()
    japi.DzFrameSetAllPoints(self.handle, ui.handle)
end

function Frame:ClearAllPoints()
    xmapi.XMFrameClearAllPoints(self.handle)
end

function Frame:GetChildrens()
    return xmapi.XMFrameGetChildrens(self.handle, 0)
end

---@param fn fun(frame:Frame)
function Frame:EnumChidrens(fn)
    local childrens = self:GetChildrens()
    for index, value in ipairs(childrens) do
        local child = Frame:Class(value)
        if child then
            fn(child)
        end
    end
end

function Frame:GetChildren(index)
    return xmapi.XMFrameGetChildren(self.handle, index)
end

function Frame:GetChildrenSize()
    local w, h = 0, 0
    self:EnumChidrens(function(child)
        if child:IsVisible() and child.__cname ~= "Scroll" then
            local cx, cy = child:GetPosition()
            local cw, ch = child:GetSize()
            if cx + cw >= w then
                w = cx + cw
            end
            if cy + ch >= h then
                h = cy + ch
            end
        end
    end)
    return w, h
end

function Frame:GetChildrenInitSize()
    local w, h = 0, 0
    self:EnumChidrens(function(child)
        if
            child:IsVisible() and
            child.__cname ~= "Scroll" and
            child ~= self['event_panel'] and
            child ~= child['event_panel']
        then
            local cx, cy = child:Get('_x'), child:Get('_y')
            local cw, ch = child:GetSize()
            if cx + cw >= w then
                w = cx + cw
            end
            if cy + ch >= h then
                h = cy + ch
            end
        end
    end)
    return w, h
end

---@type {[string]:fun(frame:Frame)}
local event_list = {
    on_click = function(frame)
        lapi.FrameSetScriptByCode(frame:GetHandle(), lapi.FrameEvent.MousePressed, function()
            local key = xmapi.XMGetTriggerKey()
            if key == 1 then
                frame:Notify('on_click')
            elseif key == 2 then
                frame:Notify('on_mid_click')
            elseif key == 4 then
                frame:Notify('on_right_click')
            end
        end)
    end,
    on_enter = function(frame)
        lapi.FrameSetScriptByCode(frame:GetHandle(), lapi.FrameEvent.MouseEnter, function()
            frame:Notify('on_enter')
        end)
    end,
    on_leave = function(frame)
        lapi.FrameSetScriptByCode(frame:GetHandle(), lapi.FrameEvent.MouseLeave, function()
            frame:Notify('on_leave')
        end)
    end,
    on_wheel = function(frame)
        lapi.FrameSetScriptByCode(frame:GetHandle(), lapi.FrameEvent.MouseWheel, function()
            local delta = xmapi.XMGetWheelDelta()
            frame:Notify('on_wheel', delta)
        end)
    end,

    on_double_click = function(frame)
        lapi.FrameSetScriptByCode(frame:GetHandle(), lapi.FrameEvent.MouseDoubleclick, function()
            frame:Notify('on_double_click')
        end)
    end,
    on_hide = function(frame)
        lapi.FrameSetScriptByCode(frame:GetHandle(), lapi.FrameEvent.Hide, function()
            frame:Notify('on_hide')
        end)
    end,
    on_show = function(frame)
        lapi.FrameSetScriptByCode(frame:GetHandle(), lapi.FrameEvent.Show, function()
            frame:Notify('on_show')
        end)
    end,
    on_update = function(frame)
        Event:Register('draw', function(trg)
            if frame.removed == nil then
                frame:Notify('on_update')
            else
                trg:Remove()
            end
        end)
    end
}
---@param name string
---@param fn fun(self:self,player:Player,...)
function Frame:Register(name, fn)
    self.event = self.event or EventManager.new()
    local list = self.event:Get(name)
    --- 判断是第一次注册
    if #list == 0 then
        if event_list[name] then
            event_list[name](self)
        end
    end
    self.event:Register(name, fn)
end

function Frame:Notify(name, ...)
    if self.event == nil then
        return
    end
    self.event:Notify(name, self, Player.Local(), ...)
end

function Frame:SetDrag(enable)
    self._drag = enable
end

function Frame:GetFocus()
    local focus = self:Class(xmapi.XMGetMouseFocus())
    return focus
end

function Frame:Reload(name)
    for key, value in pairs(instance) do
        local path = value:GetSourcePath()
        if path:find(name) then
            print('移除 Frame', path)
            value:Remove()
        end
    end
end

local storm = require 'jass.storm'
storm.save('ui\\loaded.fdf', '')
function Frame.LoadFDF(data)
    storm.save('ui\\loaded.fdf', storm.load('ui\\loaded.fdf') .. data)
    storm.save('ui\\Load.fdf', data)
    storm.save('ui\\Load.toc', '\nui\\Load.fdf\r\n')
    japi.DzLoadToc('ui\\Load.toc')
end

function Frame:SetCenter(x, y, auto_size)
    x = x or 0
    y = y or 0
    local ph, pw = 1920, 1080
    if auto_size then
        self:SetAutoSize()
    end
    local xx = ph / 2 - self:GetWidth() / 2
    local yy = pw / 2 - self:GetHeight() / 1.5
    self:SetPosition(
        xx + x,
        yy + y
    )
end

function Frame:SetAutoSize(w, h)
    local cw, ch = self:GetChildrenSize()
    self:SetSize(cw + (w or 20), ch + (h or 20))
end

---设置高亮图片
---@param image string?  不填则移除highlight
---@param type Frame.HighLight.Type?
---@param mode Frame.HighLight.Mode?
function Frame:SetHighLight(image, type, mode)
    if self._high then
        self._high:Remove()
        self._high = nil
    end
    if self._high_enter then
        self._high_enter:Remove()
        self._high_enter = nil
    end
    if self._high_leave then
        self._high_leave:Remove()
        self._high_leave = nil
    end
    if image == nil then
        return
    end
    self._alpha_type = type or Frame.HighLight.Type.FILETEXTURE
    self._alpha_mode = mode or Frame.HighLight.Mode.ADD
    self._highlight = image
    self._high_enter = self:Register('on_enter', function(trg, _, player)
        self._high = Frame.HighLight.new {
            parent     = self,
            image      = self._highlight or Const.Texture.disenable,
            alpha_type = self._alpha_type,
            alpha_mode = self._alpha_mode,
        }
    end)
    self._high_leave = self:Register('on_leave', function(trg, _, player)
        if self._high then
            self._high:Remove()
            self._high = nil
        end
    end)
end

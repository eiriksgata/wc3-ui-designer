---@class FramePlayActionField
---@field visible       boolean
---@field x             ?number  默认 0
---@field y             ?number  默认 0
---@field duration      ?number  默认 40
---@field easeing       ?lapi.TWEEN_TYPE
---@field callback      ?fun()

---播放帧动画效果
---@param params FramePlayActionField
function Frame:playActionParams(params)
    local visible  = params.visible
    local x        = params.x or 0
    local y        = params.y or 0
    local duration = params.duration or 40
    local easeing  = params.easeing or lapi.TWEEN_TYPE.Linear
    local callback = params.callback or DoNothing
    -- 检查动画状态
    if self.tween then
        return
    end

    -- 获取当前位置
    local xx, yy = self:GetPosition()

    -- 显示动画
    if visible then
        self:SetAlpha(0)
        self:SetPosition(x, y)
        self:SetVisible(true)
        self.tween = Tween.Bezier2 {
            subject = Point.new(xx - x, yy - y, 0),
            target = Point.new(xx, yy, 255),
            duration = duration,
            tween = easeing,
            on_update = function(tw, pos)
                self:SetPosition(pos:Get())
                self:SetAlpha(pos:GetZ())
            end,
            on_complate = function()
                self:SetPosition(xx, yy)
                self:SetAlpha(255)
                callback()
            end
        }
    else
        self.tween = Tween.Bezier2 {
            subject = Point.new(xx, yy, self:GetAlpha()),
            target = Point.new(xx - x, yy - y, 0),
            duration = duration,
            tween = easeing,
            on_update = function(tw, pos)
                self:SetPosition(pos:Get())
                self:SetAlpha(pos:GetZ())
            end,
            on_complate = function()
                self:SetVisible(false)
                self:SetPosition(xx, yy)
                callback()
            end
        }
    end
    Event:Register("draw", function(trg)
        if self.handle == nil or self.tween:update() then
            self.tween:Remove()
            self.tween = nil
            trg:Remove()
        end
    end)
end

function Frame:playAction(visible, x, y, duration)
    return self:playActionParams {
        visible = visible,
        x = x,
        y = y,
        duration = duration
    }
end

---@class FrameMoveField
---@field subject   Frame
---@field target    Frame
---@field angle     ?number
---@field distance  ?number
---@field duration  ?number
---@field easing    ?lapi.TWEEN_TYPE
---@field callback  fun(self:Frame)

---@param data FrameMoveField
function Frame:Move(data)
    local subject = data.subject
    local target = data.target
    local distance = data.distance or 0
    local angle = data.angle or 0
    local easing = data.easing or 0
    local callback = data.callback
    self:SetPosition(subject:GetRealPosition())
    self:SetSize(target:GetSize())
    local p_subject = Point.new(subject:GetRealPosition())
    local p_target  = Point.new(target:GetRealPosition())
    local step1     = p_subject:Polar(angle, distance)
    local tween     = Tween.Bezier2 {
        subject = p_subject,
        target = p_target,
        step1 = (angle ~= 0 or distance ~= 0) and step1 or nil,
        tween = easing,
        duration = data.duration or 110,
        on_update = function(tween, pos, rotate)
            if not self.handle then return end
            local x, y = pos:Get()
            self:SetPosition(x, y)
        end,
        on_complate = function()
            if not self.handle then return end
            self:SetVisible(false)
            if callback then
                callback(self)
            end
        end
    }
    Event:Register("draw", function(trg)
        if self.handle == nil or tween:update() then
            trg:Remove()
            tween:Remove()
            return
        end
    end)
end

---@class FrameMoveToField
---@field x         number
---@field y         number
---@field duration  number
---@field easeing   lapi.TWEEN_TYPE
---@field callback  ?fun()

---@param params FrameMoveToField
function Frame:moveTo(params)
    local x = params.x or 0
    local y = params.y or 0
    local xx, yy = self:GetPosition()
    local duration = params.duration
    local easeing = params.easeing
    local callback = params.callback or DoNothing
    local tween = Tween.Bezier2 {
        subject = Point.new(xx, yy, self:GetAlpha()),
        target = Point.new(x, y, 0),
        duration = duration,
        tween = easeing,
        on_update = function(tw, pos)
            self:SetPosition(pos:Get())
        end,
        on_complate = function()
            self:SetPosition(x, y)
            callback()
        end
    }
    Event:Register("draw", function(trg)
        if self.handle == nil or tween:update() then
            trg:Remove()
            tween:Remove()
            return
        end
    end)
end

---@param player Player
---@param target Frame
---@param image string
function Frame:playMoveAnim(player, target, image)
    if Player.IsLocal(player) then
        local panel = Frame.Panel.new {
            image = image,
        }
        panel:ClearAllPoints()
        local sw, sh = self:GetSize()
        local sx, sy = self:GetRealPosition(0)
        local tw, th = target:GetSize()
        local tx, ty = target:GetRealPosition(0)
        local tween = Tween.Bezier2 {
            subject     = Point.new(sx, sy, 1.5),
            target      = Point.new(1920 / 2 - tw / 2, 1080 / 1.75, 1),
            duration    = 30,
            on_update   = function(tween, pos, rotate)
                panel:SetPosition(pos:Get())
                local z = pos:GetZ()
                panel:SetSize(sw * z, sw * z)
            end,
            on_complate = function()
                local timer = lapi.CreateTimer()
                -- ShowRes(player, panel, '新的')
                lapi.AsynTimerStart(timer, 1, false, function()
                    local cx, cy = panel:GetPosition()
                    local cw, ch = panel:GetSize()
                    local sclae = tw / cw
                    local tween2 = Tween.Bezier2 {
                        subject     = Point.new(cx, cy, 1),
                        target      = Point.new(tx, ty, sclae),
                        duration    = 100,
                        tween       = 20,
                        on_update   = function(tween, pos, rotate)
                            panel:SetPosition(pos:Get())
                            local z = pos:GetZ()
                            panel:SetSize(sw * z, sw * z)
                        end,
                        on_complate = function()
                            panel:Remove()
                        end
                    }
                    Event:Register("draw", function(trg, player)
                        if tween2:update() then
                            tween2:Remove()
                            trg:Remove()
                        end
                    end)
                end)
            end
        }
        Event:Register("draw", function(trg, player)
            if tween:update() then
                tween:Remove()
                trg:Remove()
            end
        end)
    end
end

---@class Frame.Marquee:Frame.Panel
---@field new fun(params):Frame.Marquee
Frame.Marquee = Class('Marquee', Frame.Panel)

function Frame.Marquee:ctor(params)
    params.x = params.x or 0
    params.y = params.y or 100
    params.w = params.w or 1920
    params.h = params.h or 300
    params.parent = params.parent
   Frame. Panel.ctor(self, params)
end

function Frame.Marquee:Add(text, y, duration)
    local label = Frame.Text.new {
        parent = self,
        x = 1920,
        y = y,
        w = 0,
        h = 30,
        text = text,
        image = [[UI\控制台\bar2_dlxs.tga]],
        align = "center",
        font_size = 0.01
    }
    local w, h = label:GetSize()
    local tween = Tween.Bezier2 {
        subject = Point.new(1920, y, 0),
        target = Point.new(-w, y, 0),
        duration = duration or 1000,
        on_update = function(tween, pos, rotate)
            label:SetPosition(pos:Get())
        end,
        on_complate = function()
            label:Remove()
        end
    }

    Event:Register("draw", function(trg)
        if tween:update() then
            tween:Remove()
            label:Remove()
        end
    end)
end

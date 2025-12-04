---@class Frame.Sprite:Frame
---@field new fun(data):Frame.Sprite
Frame.Sprite = Class("Frame.Sprite", Frame)


---@param data SpriteField
function Frame.Sprite:ctor(data)
    local paretn = data.parent or Frame.GameUI
    local handle = lapi.CreateFrameByTagName("SPRITE", "@SPRITE@", paretn.handle, data.template or "", 0)
    Frame.ctor(self, handle, data)
    self:SetModel(data.model)
    self:SetModelScale(table.unpack(data.scale or { 1, 1, 1 }))
    self:SetModelXYZ(table.unpack(data.offset or { 0, 0, 0 }))
    self:SetEnable(false)
end

---设置模型
---@param path string
function Frame.Sprite:SetModel(path)
    xmapi.XMFrameSetModel(self.handle, path, 0, 0)
end

---设置模型缩放
---@param x number
---@param y number
---@param z number
function Frame.Sprite:SetModelScale(x, y, z)
    xmapi.XMFrameSetModelScale(self.handle, x, y, z)
end

---设置模型大小
---@param size number 0-100
function Frame.Sprite:SetModelSize(size)
    xmapi.XMFrameSetModelSize(self.handle, size)
end

---设置动画通过索引
---@param index integer
---@param autocast boolean
function Frame.Sprite:SetAnimateByIndex(index, autocast)
    -- xmapi.XMFrameSetModelAnimateByIndex(self.handle, index, autocast)
    japi.DzFrameSetAnimate(self.handle, index, autocast)
end

---设置动画
---@param name string 动画名
function Frame.Sprite:SetAnimateName(name)
    xmapi.XMFrameSetModelAnimate(self.handle, name)
end

---设置动画进度
---@param offset number (0-1)
function Frame.Sprite:SetAnimateOffset(offset)
    xmapi.XMFrameSetAnimateOffset(self.handle, offset)
end

---设置动画速度
---@param speed number
function Frame.Sprite:SetSpeed(speed)
    xmapi.XMFrameSetModelSpeed(self.handle, speed)
end

---复位界面中模型的矩阵 frame:ui x,y:坐标
--- 函数有问题
function Frame.Sprite:setModelMatReset()
    xmapi.XMFrameSetModelMatReset(self.handle)
end

---设置ui摄像机目标位置
---移动镜头位置
---@param x number
---@param y number
---@param z number
function Frame.Sprite:SetCameraTarget(x, y, z)
    xmapi.XMFrameSetCameraTarget(self.handle, x, y, z)
end

---设置ui摄像机位置
---@param x number
---@param y number
---@param z number
function Frame.Sprite:SetCameraSource(x, y, z)
    xmapi.XMFrameSetCameraSource(self.handle, x, y, z)
end

---设置模型位置 (相对UI的左下角)
---@param x number x位置 0-0.8
---@param y number y位置  0-0.6
---@param z number 未知作用
function Frame.Sprite:SetModelXYZ(x, y, z)
    local id = self.handle
    xmapi.XMFrameSetModelXY(id, x, y)
    xmapi.XMFrameSetModelZ(id, z)
end

---@async
---@param index number
---@param duration number
---@param callback fun()
function Frame.Sprite:PlayAnimation(index, duration, callback)
    self:SetAnimateByIndex(index, false)
    local i = 0
    if self._amin_timer then
        lapi.DestroyTimer(self._amin_timer)
        self._amin_timer = nil
    end
    self._amin_timer = lapi.CreateTimer()
    lapi.AsynTimerStart(self._amin_timer, 0.01, true, function()
        i = i + 0.01
        local per = i / duration
        self:SetAnimateOffset(per)
        if per >= 1 then
            callback()
            lapi.DestroyTimer(self._amin_timer)
            self._amin_timer = nil
        end
    end)
end

function Frame.Sprite:Remove()
    if self._amin_timer then
        lapi.DestroyTimer(self._amin_timer)
        self._amin_timer = nil
    end
    Frame.Remove(self)
end

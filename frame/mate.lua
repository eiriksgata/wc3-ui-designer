---@class FrameField
---@field x                     ?number
---@field y                     ?number
---@field w                     ?number
---@field h                     ?number
---@field alpha                 ?number
---@field drag                  ?boolean
---@field visible               ?boolean
---@field enable                ?boolean
---@field anchor                ?number
---@field parent_anchor         ?number
---@field anchor_parent         ?Frame
---@field parent                ?Frame
---@field template              ?string
---@field highlight             ?string
---@field alpha_type            ?Frame.HighLight.Type
---@field alpha_mode            ?Frame.HighLight.Mode
---@field border                ?PanelBorderField
---@field on_init               ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,parent:Frame)
---@field on_click              ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player)
---@field on_mid_click          ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player)
---@field on_right_click        ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player)
---@field on_left_down          ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player)
---@field on_left_up            ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player)
---@field on_right_down         ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player)
---@field on_right_up           ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player)
---@field on_enter              ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player)
---@field on_leave              ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player)
---@field on_show               ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player)
---@field on_hide               ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player)
---@field on_move               ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player)
---@field on_drag               ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player)
---@field on_wheel              ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player,delta:number)
---@field on_update             ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player)
---@field on_double_click       ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player)
---@field on_cooldown_refresh   ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player,cur:number,max:number)
---@field on_cooldown_finish    ?fun(trg:Trigger,self:Frame|Frame.Text|Frame.Panel|Frame.Button|Frame.Model|Frame.Sprite,player:Player)
---@field [number]              ?FrameField|PanelField|TextField|ButtonField|ModelField|SpriteField|HighlightField
---@field type                  ?"Panel"|'Text'|"Button"|"Model"|"Sprite"|"Scroll"

---@class PanelField:FrameField
---@field image         ?string


---@class ButtonField:PanelField


---@class TextField:FrameField
---@field text          ?string
---@field font_size     ?number
---@field font_path     ?string
---@field align         ?Text.text_align
---@field image         ?string
---@field outline       ?TextOutLineField
---@field color         ?TextGColorField
---@field stroke        ?number


---@class SpriteField:FrameField
---@field model string
---@field scale number[]
---@field offset number[]


---@class ModelField:FrameField
---@field model string


---@class HighlightField:FrameField
---@field image           ?string

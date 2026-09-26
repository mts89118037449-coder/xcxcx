# Real-ESRGAN (RRDBNet ×4) без basicsr: апскейл вырезок с листов перед сохранением.
# Веса: RealESRGAN_x4plus_anime_6B.pth (путь в переменной окружения ESRGAN_WEIGHTS).
import os
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F


class RDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf, gc):
        super().__init__()
        self.rdb1, self.rdb2, self.rdb3 = RDB(nf, gc), RDB(nf, gc), RDB(nf, gc)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, nb, nf=64, gc=32):
        super().__init__()
        self.conv_first = nn.Conv2d(3, nf, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
        self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


_net = None


def enabled():
    return bool(os.environ.get('ESRGAN_WEIGHTS'))


def _load():
    global _net
    if _net is None:
        sd = torch.load(os.environ['ESRGAN_WEIGHTS'], map_location='cpu', weights_only=True)
        sd = sd.get('params_ema', sd.get('params', sd))
        nb = 1 + max(int(k.split('.')[1]) for k in sd if k.startswith('body.'))
        _net = RRDBNet(nb)
        _net.load_state_dict(sd, strict=True)
        _net.eval()
    return _net


def upscale4(rgb: np.ndarray) -> np.ndarray:
    """uint8 HxWx3 → uint8 4Hx4Wx3."""
    net = _load()
    x = torch.from_numpy(rgb.astype(np.float32) / 255).permute(2, 0, 1)[None]
    pad = 4  # отражённые поля, чтобы края не темнели
    x = F.pad(x, (pad, pad, pad, pad), mode='reflect')
    with torch.no_grad():
        y = net(x)[0, :, pad * 4 : -pad * 4, pad * 4 : -pad * 4]
    return (y.clamp(0, 1).permute(1, 2, 0).numpy() * 255).round().astype(np.uint8)

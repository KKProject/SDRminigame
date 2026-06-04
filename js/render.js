GameGlobal.canvas = wx.createCanvas();

const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();

const width = windowInfo.windowWidth || windowInfo.screenWidth;
const height = windowInfo.windowHeight || windowInfo.screenHeight;

canvas.width = width;
canvas.height = height;

export const SCREEN_WIDTH = width;
export const SCREEN_HEIGHT = height;

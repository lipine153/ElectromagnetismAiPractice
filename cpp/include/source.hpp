#pragma once

#include "vec3.hpp"

// 场源种类编码。必须与前端 src/scene/types.ts 的 SOURCE_KIND 保持一致。
enum SourceKind : int {
    kCharge = 1,        // 点电荷     p0 = q (C)
    kStraightWire = 2,  // 无限长直导线 p0 = I (A)，dir = 电流方向
    kCurrentLoop = 3,   // 圆电流环    p0 = I (A)，p1 = 半径 (m)，dir = 法向
    kSolenoid = 4,      // 螺线管      p0 = I (A)，p1 = 匝密度 (匝/m)，dir = 轴
    kDipole = 5,        // 磁偶极子    p0 = m (A·m²)，dir = 磁矩方向
    kCapacitor = 6,     // 电容器      p0 = Q (C)，p1 = dQ/dt (A)，dir = 极板法向
};

// 每个场源在平铺 double 数组里占 12 个：kind, pos(3), dir(3), vel(3), p0, p1
constexpr int kSourceStride = 12;

struct Source {
    int kind = 0;
    Vec3 pos{};         // 位置
    Vec3 dir{0, 0, 1};  // 方向（单位向量）
    Vec3 vel{};         // 速度（用于运动源）
    double p0 = 0.0;
    double p1 = 0.0;
};

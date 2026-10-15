#pragma once

#include <vector>

#include "vec3.hpp"

enum FieldSelect : int {
    kFieldE = 0,
    kFieldB = 1,
};

// RK4 单步：沿 sign 方向（+1 顺场、-1 逆场）前进 ds
Vec3 rk4Step(int field, int sign, const Vec3& pos, double ds);

// 从 seed 出发追踪一条场线，结果追加进 out。
// 追加格式：[count, (x, y, z, |F|) x count]
//   sign        +1 顺场（从正电荷出发）、-1 逆场（用于负电荷）
//   stopRadius  距任一场源小于该值即停止（在源上收线）
void traceInto(int field, int sign, const Vec3& seed, double step, int maxSteps, double maxRadius,
               double stopRadius, std::vector<float>& out);

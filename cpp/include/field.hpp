#pragma once

#include <vector>

#include "source.hpp"
#include "vec3.hpp"

// 物理常数（SI）
constexpr double kPi = 3.14159265358979323846;
constexpr double kEpsilon0 = 8.8541878128e-12;   // 真空介电常数 F/m
constexpr double kMu0 = 1.25663706212e-6;        // 真空磁导率 H/m

// 设置当前场景的场源列表（整体替换）
void setSources(const std::vector<Source>& sources);
void clearSources();

// 在给定点求电场 / 磁场（所有场源叠加）
Vec3 evalE(const Vec3& pos);
Vec3 evalB(const Vec3& pos);

// 到最近场源的距离（追踪时用于在源附近收线，避免绕圈）
double distanceToNearestSource(const Vec3& pos);

// 到最近「点状」场源（点电荷 / 偶极子）的距离。
// 圆电流环的 pos 是**圆心**、直导线的 pos 是**段起点**，把它们当碰撞距离会把
// 「从螺线管内部穿过」误判成撞墙，所以自由电荷的碰撞判定只能用它。
double distanceToNearestPointSource(const Vec3& pos);

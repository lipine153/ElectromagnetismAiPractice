#pragma once

#include <Eigen/Core>

// ===================== 物理模型（可替换） =====================
// 输入空间点，返回该点的磁感应强度矢量。
// 想换场分布时，只需要改这里的实现（cpp/src/field.cpp），
// 积分器与 Wasm 导出都通过本接口取场，不需要改动。
Eigen::Vector3d getMagneticField(const Eigen::Vector3d& pos);

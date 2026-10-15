#pragma once

#include <cmath>

// 极简三维向量：本项目只需要加减/数乘/点积/叉积/模/归一化，
// 因此不引入 Eigen 之类的线性代数库。
struct Vec3 {
    double x = 0.0;
    double y = 0.0;
    double z = 0.0;

    Vec3() = default;
    Vec3(double x_, double y_, double z_) : x(x_), y(y_), z(z_) {}

    Vec3 operator+(const Vec3& o) const { return {x + o.x, y + o.y, z + o.z}; }
    Vec3 operator-(const Vec3& o) const { return {x - o.x, y - o.y, z - o.z}; }
    Vec3 operator*(double s) const { return {x * s, y * s, z * s}; }
    Vec3 operator-() const { return {-x, -y, -z}; }
    Vec3& operator+=(const Vec3& o) {
        x += o.x;
        y += o.y;
        z += o.z;
        return *this;
    }

    double dot(const Vec3& o) const { return x * o.x + y * o.y + z * o.z; }

    Vec3 cross(const Vec3& o) const {
        return {y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x};
    }

    double normSq() const { return x * x + y * y + z * z; }
    double norm() const { return std::sqrt(normSq()); }

    Vec3 normalized() const {
        const double n = norm();
        return n > 1e-12 ? Vec3{x / n, y / n, z / n} : Vec3{};
    }
};

inline Vec3 operator*(double s, const Vec3& v) { return v * s; }

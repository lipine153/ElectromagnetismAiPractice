#include <emscripten.h>

#include <cstddef>
#include <vector>

#include "field.hpp"
#include "integrator.hpp"

namespace {

// C++ 侧持久缓冲：trace_lines 每帧复用，避免反复 malloc/free 与跨界调用。
std::vector<float> g_out;

}  // namespace

// 上传/替换场源列表。data 为平铺 double，每个源 kSourceStride 个。
extern "C" EMSCRIPTEN_KEEPALIVE
void set_sources(const double* data, int count) {
    std::vector<Source> sources;
    sources.reserve(static_cast<std::size_t>(count));
    for (int i = 0; i < count; ++i) {
        const double* p = data + static_cast<std::ptrdiff_t>(i) * kSourceStride;
        Source s;
        s.kind = static_cast<int>(p[0]);
        s.pos = Vec3{p[1], p[2], p[3]};
        s.dir = Vec3{p[4], p[5], p[6]};
        s.vel = Vec3{p[7], p[8], p[9]};
        s.p0 = p[10];
        s.p1 = p[11];
        sources.push_back(s);
    }
    setSources(sources);
}

// 批量追踪场线。
//   field      0=E, 1=B
//   seeds      平铺 double，每个种子 4 个：[x, y, z, sign]
//   stopRadius 贴到源该距离内即收线
// 返回指向内部缓冲的指针，内容为 [count, (x,y,z,|F|) x count] 顺序拼接。
// 注意：调用后若内存增长，JS 侧需重新获取 HEAPF32 视图。
extern "C" EMSCRIPTEN_KEEPALIVE
const float* trace_lines(int field, const double* seeds, int seedCount, double step, int maxSteps,
                         double maxRadius, double stopRadius) {
    g_out.clear();
    g_out.reserve(static_cast<std::size_t>(seedCount) * 4096);

    for (int i = 0; i < seedCount; ++i) {
        const double* s = seeds + static_cast<std::ptrdiff_t>(i) * 4;
        const int sign = s[3] < 0.0 ? -1 : 1;
        traceInto(field, sign, Vec3{s[0], s[1], s[2]}, step, maxSteps, maxRadius, stopRadius, g_out);
    }
    return g_out.data();
}

// 单点求场：out6 = [Ex, Ey, Ez, Bx, By, Bz]
extern "C" EMSCRIPTEN_KEEPALIVE
void eval_field(double x, double y, double z, double* out6) {
    const Vec3 pos{x, y, z};
    const Vec3 e = evalE(pos);
    const Vec3 b = evalB(pos);
    out6[0] = e.x;
    out6[1] = e.y;
    out6[2] = e.z;
    out6[3] = b.x;
    out6[4] = b.y;
    out6[5] = b.z;
}

// 推进自由点电荷一个「帧步长」。
//   state6   就地读写：[x, y, z, vx, vy, vz]
//   qOverM   q/m (C/kg)
//   dt       单个子步的物理时长
// 返回持久缓冲指针：[count, stopped, (x, y, z) x count]（本帧的子步采样点）。
// 注意：调用后若内存增长，JS 侧需重新获取 HEAPF32 视图。
extern "C" EMSCRIPTEN_KEEPALIVE
const float* particle_advance(double* state6, double qOverM, double dt, int substeps,
                              double maxRadius, double stopRadius) {
    ParticleState state{Vec3{state6[0], state6[1], state6[2]}, Vec3{state6[3], state6[4], state6[5]}};
    borisAdvance(state, qOverM, dt, substeps, maxRadius, stopRadius, g_out);

    state6[0] = state.pos.x;
    state6[1] = state.pos.y;
    state6[2] = state.pos.z;
    state6[3] = state.vel.x;
    state6[4] = state.vel.y;
    state6[5] = state.vel.z;
    return g_out.data();
}

import typescript from 'rollup-plugin-typescript2';
import pkg from './package.json';

const outputDefaults = {
    globals: {
        'gun/gun': 'Gun',
        'gun/sea': 'SEA',
    }
};

export default {
    input: 'src/index.ts',
    output: [
        {
            ...outputDefaults,
            file: pkg.main,
            format: 'cjs',
        },
        {
            ...outputDefaults,
            file: pkg.module,
            format: 'es',
        },
        {
            ...outputDefaults,
            name: 'GunUtil',
            file: pkg.browser,
            format: 'umd',
        },
    ],
    external: [
        'gun/gun',
        'gun/sea',
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.peerDependencies || {}),
    ],
    plugins: [
        typescript({
            typescript: require('typescript'),
            tsconfigOverride: {
                compilerOptions: {
                    module: 'ESNext',
                    target: 'es5',
                }
            }
        }),
    ],
};

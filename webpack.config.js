const path = require('path');
const pkg = require('./package.json');

module.exports = {
    target: 'node',
    entry: {
        index: './src/index.ts',
        // Auth: './src/Auth.ts',
        // encryption: './src/encryption.ts',
        // DateTree: './src/DateTree.ts',
        // filter: './src/filter.ts',
        // iterate: './src/iterate.ts',
        // support: './src/support.ts',
        // temp: './src/temp.ts',
        // wait: './src/wait.ts',
    },
    devtool: 'inline-source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: [
                    /examples/,
                    /node_modules/,
                    /tests/,
                ]
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist'),
    },
    externals: [
        // ...Object.keys(pkg.dependencies || {}),
        // ...Object.keys(pkg.peerDependencies || {}),
        // /^gun\/.+$/, // Everything that starts with "gun/"
        {
            gun: {
                commonjs: 'gun',
                amd: 'gun',
                root: 'Gun' // indicates global variable
            },
            'gun/gun': {
                commonjs: 'gun/gun',
                amd: 'gun/gun',
                root: 'Gun' // indicates global variable
            },
            'gun/sea': {
                commonjs: 'gun/sea',
                amd: 'gun/sea',
                root: 'SEA' // indicates global variable
            },
            lodash: {
                commonjs: 'lodash',
                amd: 'lodash',
                root: '_' // indicates global variable
            },
            moment: {
                commonjs: 'moment',
                amd: 'moment',
                root: 'moment' // indicates global variable
            },
        },
    ],
    optimization: {
        splitChunks: {
            chunks: 'all',
        }
    }
};

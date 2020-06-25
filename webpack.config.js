const path = require('path');
const pkg = require('./package.json');

module.exports = {
    entry: {
        // index: './src/index.ts',
        Auth: './src/Auth.ts',
        encryption: './src/encryption.ts',
        DateTree: './src/DateTree.ts',
        filter: './src/filter.ts',
        iterate: './src/iterate.ts',
        support: './src/support.ts',
        temp: './src/temp.ts',
        wait: './src/wait.ts',
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
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, 'dist'),
    },
    externals: [
        /^gun\/.+$/, // Everything that starts with "gun/"
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.peerDependencies || {}),
    ],
    optimization: {
        splitChunks: {
            chunks: 'all',
        }
    }
};

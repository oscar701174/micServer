import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import videoRouter from './video/video.route.js';
class HlsServer {
    app;
    constructor() {
        const app = express();
        this.app = app;
    }
    setupRoutes() {
        this.app.use('/video', videoRouter);
    }
    setupMiddleware() {
        this.app.use(morgan('dev'));
        this.app.use(cors());
        this.app.use((req, res, next) => {
            console.log("this is a middleware log");
            next();
        });
        // Serve HLS files from tmp directory
        this.app.use('/video/hls', express.static(path.join(process.cwd(), 'tmp/hls')));
        this.setupRoutes();
        this.app.use(express.json());
        // this.app.use((req,res,next) => {
        //     console.log('this is a middleware error');
        //     res.send({error:"middleware error"});
        // });
    }
    listen(port) {
        this.setupMiddleware();
        this.app.get('/', (req, res) => {
            res.send('HLS Server is running successfully!');
        });
        this.app.listen(port, () => {
            console.log(`HLS Server is running on http://localhost:${port}`);
        });
    }
}
function init() {
    const server = new HlsServer();
    server.listen(8080);
}
init();

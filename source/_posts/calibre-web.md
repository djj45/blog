---
title: 搭建自己的在线图书馆
date: 2022-1-25 20:55:00
excerpt: 用docker搭建私人在线图书馆，nginx反向代理
categories: 图书馆
tags: [docker, nginx, calibre]
---
项目地址：

https://github.com/linuxserver/docker-calibre-web

官方docker-compose文件：

https://github.com/linuxserver/docker-calibre-web#docker-compose-recommended-click-here-for-more-info

要修改的是TZ（timezone）与volumes里面的路径，新建两个文件夹，`/path/to/calibre/library`是放`metadata.db`的地方，要用calibre电脑版新建一个书库，导出一个新的db文件，`/path/to/data`是放配置文件的。

```shell
curl -sSL get.docker.com | sh                     #安装docker
curl -L https://github.com/docker/compose/releases/download/1.29.2/docker-compose-`uname -s`-`uname -m` -o /usr/local/bin/docker-compose               #安装docker-compose
chmod +x /usr/local/bin/docker-compose            #docker-compose赋予权限
mkdir ebooks                                      #不能在root目录下新建文件夹
cd ebooks
mkdir books
mkdir config
wget https://github.com/djj45/temp/raw/main/docker-compose.yml      #下载配置
cd books
wget https://github.com/djj45/temp/raw/main/metadata.db             #下载db数据库
chmod 777 metadata.db                                               #赋予权限
cd ..                                                               #回到ebooks目录里面
docker-compose up -d     #如果docker-compose配置文件名不是docker-compose.yml，用-f filename指定配置文件名
ufw allow 8083           #开放端口即可通过x.x.x.x:8083访问
```

如果想域名访问，不必开放8083端口，域名解析

| 类型 | 名称 |  内容   |
| :--: | :--: | :-----: |
|  A   | book | x.x.x.x |

```shell
#nginx配置参考nginx配置ssl篇
#如果上传出现413错误
vim /etc/nginx/nginx.conf
#http{}段中加入
client_max_body_size 50M;     #设置最多上传50M的电子书
#重启nginx
service nginx restart
```

访问`book.djj45.com`，初始账号是admin，密码是admin123，db数据库位置来到根目录，选`books`，设置语言为中文，开启上传功能，管理用户权限->允许admin用户上传，修改admin用户密码。

[示例](https://book.djj45.com/)：账号密码都是djj45
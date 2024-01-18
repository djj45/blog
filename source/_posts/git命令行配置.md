---
title: git命令行配置
date: 2024-1-18 21:09:00
excerpt: git命令行配置
categories: 教程
tags: [git, github]
---
1、打开路径`C:\Users\xxx\.ssh`

2、右键，点击git bash here

3、输入以下命令

```bash
git config --global user.name "your_name"                # 与github用户名和邮箱一致
git config --global user.email your_email@example.com

ssh-keygen -t rsa -C "your_email@example.com"      # 生成的密钥可以自己命名，不想命名一路回车即可
eval $(ssh-agent -s)                               # 启动ssh-agent
ssh-add ./id_rsa                                   # 添加私钥，前面重命名了这里换成对应的名字
```

4、用记事本打开当前目录下的`config`，复制粘贴以下内容，前面重命名了记得改`IdentityFile`对应的私钥名

```
# github
Host github.com
        User git
        Hostname ssh.github.com
        Port 443
        PreferredAuthentications publickey
        IdentityFile ~/.ssh/id_rsa
        IdentitiesOnly yes
        AddKeysToAgent yes
```

5、用记事本打开并复制当前目录下的私钥`id_rsa.pub`内容，如果前面重命名了，私钥的名字也会改变

6、打开github，点击右上角头像，点击`Settings`->`SSH and GPG keys`->`New SSH key`，把公钥内容粘贴过来，公钥名字随便

7、测试

```bash
ssh -T git@github.com                                # 根据提示输入yes，显示Hi就成功了
ssh -vT git@github.com                               # 连接不成功的debug命令
```

8、代理命令行

`clash`->`主页`->`端口`->`终端`->`仅复制命令`->`自定义`->`copy`

```bash
export https_proxy=http://127.0.0.1:7890;export http_proxy=http://127.0.0.1:7890;export all_proxy=socks5://127.0.0.1:7890                    # 注意端口号
```


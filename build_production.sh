#first prompt so that we don't mess everything up like that time :/
select yn in "No" "Yes"; do
    case $yn in
        No ) exit;;
    esac
done

#remove all console.logs
#set debug to false
find . -name "*.js" -exec sed -E -i 's/console\.log\(.*\);?$//g' {} \; -exec sed -E -i 's/DEBUG = true/DEBUG = false/g' {} \;

name=addon.xpi
rm $name
zip -r $name . -x "*.xpi" "*.bat" "*.sh" "*.psd" "*.md" "*.code-workspace" "*.gitignore" ".git/" ".git/*" "extras/" "extras/*"
